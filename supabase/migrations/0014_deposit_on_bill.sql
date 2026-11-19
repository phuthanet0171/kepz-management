-- =====================================================================
-- Kepz — เงินประกันอยู่ในใบวางบิลและใบเสร็จ
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0008 แล้ว (รันครั้งเดียว)
--
-- * รายการในบิลมีประเภทใหม่ 'deposit' (เงินประกัน) ไม่คิด VAT / หัก ณ ที่จ่าย
-- * เมื่อใบวางบิลที่มีเงินประกันชำระครบ ระบบบันทึก "รับเงินประกัน" ให้อัตโนมัติ
--   ถ้ายกเลิกใบเสร็จจนบิลไม่ครบ รายการรับเงินประกันนั้นจะถูกถอนออก
-- =====================================================================

alter table public.invoice_items drop constraint if exists invoice_items_item_type_check;
alter table public.invoice_items add constraint invoice_items_item_type_check
  check (item_type in ('rent', 'late_fee', 'other', 'discount', 'deposit'));

-- เงินประกันที่รับผ่านใบวางบิล (ผูกกับบิล เพื่อถอนออกได้เมื่อยกเลิกใบเสร็จ)
alter table public.deposit_transactions add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create unique index if not exists deposit_transactions_invoice_key on public.deposit_transactions (invoice_id) where invoice_id is not null;

-- ภาษีคิดจากรายการที่ไม่ใช่เงินประกัน · subtotal รวมเงินประกันด้วย (subtotal + VAT − หัก ณ ที่จ่าย = total)
create or replace function public.apply_invoice_tax(
  p_invoice_id uuid,
  p_vat_rate numeric,
  p_vat_inclusive boolean,
  p_wht_rate numeric
)
returns void
language plpgsql
as $$
declare
  v_sum   numeric(12,2);
  v_dep   numeric(12,2);
  v_sub   numeric(12,2);
  v_vat   numeric(12,2) := 0;
  v_wht   numeric(12,2) := 0;
  v_total numeric(12,2);
  v_paid  numeric(12,2);
begin
  perform public.assert_owner();

  select coalesce(sum(amount) filter (where item_type <> 'deposit'), 0),
         coalesce(sum(amount) filter (where item_type = 'deposit'), 0)
    into v_sum, v_dep
  from public.invoice_items where invoice_id = p_invoice_id;

  if coalesce(p_vat_rate, 0) = 0 then
    v_sub := v_sum;
  elsif p_vat_inclusive then
    v_vat := round(v_sum * p_vat_rate / (100 + p_vat_rate), 2);
    v_sub := v_sum - v_vat;
  else
    v_sub := v_sum;
    v_vat := round(v_sum * p_vat_rate / 100, 2);
  end if;

  if coalesce(p_wht_rate, 0) > 0 then
    v_wht := round(v_sub * p_wht_rate / 100, 2);
  end if;
  v_total := v_sub + v_vat - v_wht + v_dep;

  select paid_amount into v_paid from public.invoices where id = p_invoice_id;
  if v_paid > v_total then
    raise exception 'ยอดชำระแล้ว (% บาท) มากกว่ายอดใบวางบิลใหม่ (% บาท)', v_paid, v_total;
  end if;

  update public.invoices
  set subtotal = v_sub + v_dep,
      vat_rate = coalesce(p_vat_rate, 0),
      vat_inclusive = coalesce(p_vat_inclusive, true),
      vat_amount = v_vat,
      wht_rate = coalesce(p_wht_rate, 0),
      wht_amount = v_wht,
      total = v_total,
      status = case
                 when status = 'void' then 'void'
                 when v_total = 0 or paid_amount >= v_total then 'paid'
                 when paid_amount > 0 then 'partial'
                 else 'unpaid'
               end
  where id = p_invoice_id;
end;
$$;

-- สร้างใบวางบิล: รับรายการประเภทเงินประกันได้
create or replace function public.create_invoice(
  p_contract_id uuid,
  p_period_start date,
  p_period_end date,
  p_issue_date date,
  p_due_date date,
  p_items jsonb,
  p_note text,
  p_vat boolean default null,
  p_vat_inclusive boolean default null,
  p_wht boolean default null
)
returns uuid
language plpgsql
as $$
declare
  c          public.contracts;
  s          public.settings;
  last_inv   public.invoices;
  v_id       uuid;
  v_sum      numeric(12,2) := 0;
  v_has_rent boolean := false;
  it         jsonb;
  v_qty      numeric;
  v_price    numeric;
  v_amount   numeric(12,2);
  v_type     text;
  v_order    int := 0;
  v_vat      boolean;
  v_incl     boolean;
  v_wht      boolean;
begin
  perform public.assert_owner();

  select * into c from public.contracts where id = p_contract_id;
  if not found then
    raise exception 'ไม่พบสัญญา';
  end if;
  if c.status = 'cancelled' then
    raise exception 'สัญญานี้ถูกยกเลิกแล้ว';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ';
  end if;

  if (p_period_start is null) <> (p_period_end is null) then
    raise exception 'ต้องระบุรอบบิลทั้งวันเริ่มและวันสิ้นสุด';
  end if;
  if p_period_start is not null then
    if p_period_end < p_period_start then
      raise exception 'วันสิ้นสุดรอบบิลต้องไม่ก่อนวันเริ่ม';
    end if;
    if p_period_start < c.start_date or p_period_end > c.end_date then
      raise exception 'รอบบิลต้องอยู่ในช่วงสัญญา (% ถึง %)',
        to_char(c.start_date, 'DD/MM/YYYY'), to_char(c.end_date, 'DD/MM/YYYY');
    end if;
  end if;

  select * into s from public.settings where id = 1;

  -- ค่าเริ่มต้นของภาษี: ตามใบล่าสุดของสัญญานี้ (ลูกค้าบริษัทตั้งครั้งเดียวใช้ต่อได้) ถ้าไม่มี = ไม่มีภาษี
  select * into last_inv from public.invoices
  where contract_id = c.id and status <> 'void'
  order by created_at desc limit 1;
  v_vat  := coalesce(p_vat, coalesce(last_inv.vat_rate, 0) > 0);
  v_incl := coalesce(p_vat_inclusive, last_inv.vat_inclusive, s.vat_inclusive, true);
  v_wht  := coalesce(p_wht, coalesce(last_inv.wht_rate, 0) > 0);

  insert into public.invoices (
    invoice_no, contract_id, period_start, period_end, issue_date, due_date,
    subtotal, vat_rate, vat_inclusive, vat_amount, total, note
  ) values (
    public.next_doc_no('invoice'), c.id, p_period_start, p_period_end, p_issue_date, p_due_date,
    0, 0, v_incl, 0, 0, nullif(trim(p_note), '')
  ) returning id into v_id;

  for it in select value from jsonb_array_elements(p_items) loop
    v_type  := it ->> 'item_type';
    v_qty   := (it ->> 'quantity')::numeric;
    v_price := abs((it ->> 'unit_price')::numeric);
    if v_type not in ('rent', 'late_fee', 'other', 'discount', 'deposit') then
      raise exception 'ประเภทรายการไม่ถูกต้อง';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'จำนวนต้องมากกว่า 0';
    end if;
    if v_price is null or v_price = 0 then
      raise exception 'ราคาต่อหน่วยต้องมากกว่า 0';
    end if;
    v_amount := round(v_qty * v_price, 2);
    if v_type = 'discount' then
      v_amount := -v_amount;
      v_price  := -v_price;
    end if;
    if v_type = 'rent' then
      v_has_rent := true;
    end if;
    v_order := v_order + 1;

    insert into public.invoice_items (invoice_id, sort_order, item_type, description, quantity, unit_price, amount)
    values (v_id, v_order, v_type, trim(it ->> 'description'), v_qty, v_price, v_amount);

    v_sum := v_sum + v_amount;
  end loop;

  if v_sum < 0 then
    raise exception 'ยอดรวมต้องไม่ติดลบ';
  end if;

  if v_has_rent and p_period_start is null then
    raise exception 'รายการค่าเช่าต้องระบุรอบบิล';
  end if;

  -- กันออกบิลค่าเช่าซ้อนรอบเดิม
  if v_has_rent and exists (
    select 1
    from public.invoices i
    where i.contract_id = c.id
      and i.id <> v_id
      and i.status <> 'void'
      and i.period_start is not null
      and i.period_start <= p_period_end
      and i.period_end >= p_period_start
      and exists (select 1 from public.invoice_items x where x.invoice_id = i.id and x.item_type = 'rent')
  ) then
    raise exception 'มีใบวางบิลค่าเช่าที่ครอบคลุมช่วง % ถึง % อยู่แล้ว',
      to_char(p_period_start, 'DD/MM/YYYY'), to_char(p_period_end, 'DD/MM/YYYY');
  end if;

  perform public.apply_invoice_tax(
    v_id,
    case when v_vat then coalesce(nullif(s.vat_rate, 0), 7) else 0 end,
    v_incl,
    case when v_wht then 5 else 0 end
  );

  return v_id;
end;
$$;

-- บิลที่มีเงินประกันชำระครบ → บันทึกรับเงินประกัน · กลับเป็นไม่ครบ/ยกเลิก → ถอนรายการนั้น
create or replace function public.sync_invoice_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep     numeric(12,2);
  v_room    numeric(12,2);
  v_pay     public.payments;
  v_deposit numeric(12,2);
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select coalesce(sum(amount), 0) into v_dep from invoice_items where invoice_id = new.id and item_type = 'deposit';
    if v_dep <= 0 or exists (select 1 from deposit_transactions where invoice_id = new.id) then
      return new;
    end if;
    select deposit_amount into v_deposit from contracts where id = new.contract_id;
    v_room := v_deposit - public.deposit_balance(new.contract_id);
    v_dep := least(v_dep, v_room);
    if v_dep <= 0 then
      return new;
    end if;
    select * into v_pay from payments where invoice_id = new.id and not is_void order by paid_on desc, created_at desc limit 1;
    insert into deposit_transactions (contract_id, txn_type, amount, txn_date, method, reference, note, invoice_id)
    values (new.contract_id, 'receive', v_dep, coalesce(v_pay.paid_on, public.today_th()), coalesce(v_pay.method, 'transfer'),
            v_pay.reference, 'รับพร้อมใบวางบิล ' || new.invoice_no, new.id);
  elsif old.status = 'paid' and new.status is distinct from 'paid' then
    delete from deposit_transactions where invoice_id = new.id and txn_type = 'receive';
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_invoice_deposit() from anon, public;

drop trigger if exists invoices_sync_deposit on public.invoices;
create trigger invoices_sync_deposit after update of status on public.invoices
  for each row execute function public.sync_invoice_deposit();

notify pgrst, 'reload schema';
