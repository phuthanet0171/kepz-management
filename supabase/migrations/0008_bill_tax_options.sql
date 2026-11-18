-- =====================================================================
-- 0008 เลือกภาษีได้ทีละใบวางบิล: VAT 7% และ/หรือ หัก ณ ที่จ่าย 5%
--
-- ยอด total ของใบวางบิล = ยอดที่ลูกค้าต้องโอนจริง (หลังหัก ณ ที่จ่าย)
--   มูลค่าก่อนภาษี (subtotal) + VAT (vat_amount) − หัก ณ ที่จ่าย (wht_amount) = total
-- การรับชำระ ยอดค้าง และรายงานเดิมจึงทำงานต่อได้โดยไม่ต้องแก้
-- รันซ้ำได้
-- =====================================================================

alter table public.invoices
  add column if not exists wht_rate   numeric(5,2)  not null default 0,
  add column if not exists wht_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_wht_check') then
    alter table public.invoices
      add constraint invoices_wht_check check (wht_rate >= 0 and wht_rate <= 15 and wht_amount >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- คำนวณยอดภาษีจากรายการในบิล (ใช้ทั้งตอนสร้างและตอนเปลี่ยนภาษี)
-- ---------------------------------------------------------------------
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
  v_sub   numeric(12,2);
  v_vat   numeric(12,2) := 0;
  v_wht   numeric(12,2) := 0;
  v_total numeric(12,2);
  v_paid  numeric(12,2);
begin
  perform public.assert_owner();

  select coalesce(sum(amount), 0) into v_sum from public.invoice_items where invoice_id = p_invoice_id;

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
  v_total := v_sub + v_vat - v_wht;

  select paid_amount into v_paid from public.invoices where id = p_invoice_id;
  if v_paid > v_total then
    raise exception 'ยอดชำระแล้ว (% บาท) มากกว่ายอดใบวางบิลใหม่ (% บาท)', v_paid, v_total;
  end if;

  update public.invoices
  set subtotal = v_sub,
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

-- ---------------------------------------------------------------------
-- สร้างใบวางบิล (เพิ่มตัวเลือกภาษี; ไม่ส่ง = ใช้แบบเดียวกับใบล่าสุดของสัญญานี้)
-- ---------------------------------------------------------------------
drop function if exists public.create_invoice(uuid, date, date, date, date, jsonb, text);

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
    if v_type not in ('rent', 'late_fee', 'other', 'discount') then
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

-- ---------------------------------------------------------------------
-- เปลี่ยนภาษีของใบวางบิลก่อนพิมพ์/ส่ง (ทำได้เมื่อยังไม่มีการรับชำระ)
-- ---------------------------------------------------------------------
create or replace function public.set_invoice_tax(
  p_invoice_id uuid,
  p_vat boolean,
  p_vat_inclusive boolean,
  p_wht boolean
)
returns void
language plpgsql
as $$
declare
  inv public.invoices;
  s   public.settings;
begin
  perform public.assert_owner();

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'ไม่พบใบวางบิล';
  end if;
  if inv.status = 'void' then
    raise exception 'ใบวางบิลนี้ถูกยกเลิกแล้ว';
  end if;
  if exists (select 1 from public.payments where invoice_id = inv.id and not is_void) then
    raise exception 'มีการรับชำระแล้ว เปลี่ยนภาษีไม่ได้ ต้องยกเลิกใบเสร็จก่อน';
  end if;

  select * into s from public.settings where id = 1;
  perform public.apply_invoice_tax(
    inv.id,
    case when p_vat then coalesce(nullif(s.vat_rate, 0), 7) else 0 end,
    coalesce(p_vat_inclusive, true),
    case when p_wht then 5 else 0 end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- ข้อความแจ้งเตือนเดิม: เปลี่ยนคำว่า "ใบแจ้งหนี้" เป็น "ใบวางบิล"
-- ---------------------------------------------------------------------
create or replace function public.recompute_invoice_paid()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid  numeric(12,2);
  v_total numeric(12,2);
  v_status text;
begin
  select total, status into v_total, v_status
  from public.invoices where id = v_invoice_id for update;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments where invoice_id = v_invoice_id and not is_void;

  if v_paid > v_total then
    raise exception 'ยอดรับชำระรวม (% บาท) เกินยอดใบวางบิล (% บาท)', v_paid, v_total;
  end if;

  if v_status = 'void' and v_paid > 0 then
    raise exception 'ใบวางบิลนี้ถูกยกเลิกแล้ว ไม่สามารถรับชำระได้';
  end if;

  update public.invoices
  set paid_amount = v_paid,
      status = case
                 when status = 'void' then 'void'
                 when v_paid = 0 then 'unpaid'
                 when v_paid < total then 'partial'
                 else 'paid'
               end
  where id = v_invoice_id;

  return null;
end;
$$;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  inv public.invoices;
begin
  perform public.assert_owner();

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'ไม่พบใบวางบิล';
  end if;
  if inv.status = 'void' then
    raise exception 'ใบวางบิลนี้ถูกยกเลิกไปแล้ว';
  end if;
  if exists (select 1 from public.payments where invoice_id = inv.id and not is_void) then
    raise exception 'มีการรับชำระแล้ว ต้องยกเลิกใบเสร็จทั้งหมดก่อน';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการยกเลิก';
  end if;

  update public.invoices
  set status = 'void', void_reason = trim(p_reason), voided_at = now()
  where id = inv.id;
end;
$$;

create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_slip_path text,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  inv  public.invoices;
  v_id uuid;
begin
  perform public.assert_owner();

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'ไม่พบใบวางบิล';
  end if;
  if inv.status = 'void' then
    raise exception 'ใบวางบิลนี้ถูกยกเลิกแล้ว';
  end if;
  if inv.status = 'paid' then
    raise exception 'ใบวางบิลนี้ชำระครบแล้ว';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'ยอดชำระต้องมากกว่า 0';
  end if;
  if p_amount > inv.total - inv.paid_amount then
    raise exception 'ยอดชำระเกินยอดค้าง (% บาท)', inv.total - inv.paid_amount;
  end if;

  insert into public.payments (receipt_no, invoice_id, paid_on, amount, method, reference, slip_path, note)
  values (
    public.next_doc_no('receipt'), inv.id, p_paid_on, p_amount, p_method,
    nullif(trim(p_reference), ''), nullif(trim(p_slip_path), ''), nullif(trim(p_note), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- view ใบวางบิล: สร้างใหม่ให้มีคอลัมน์หัก ณ ที่จ่าย
-- ---------------------------------------------------------------------
drop view if exists public.v_invoices;
create view public.v_invoices
with (security_invoker = true)
as
select
  i.*,
  i.total - i.paid_amount as outstanding,
  (i.status in ('unpaid', 'partial') and i.due_date < public.today_th()) as is_overdue,
  greatest(public.today_th() - i.due_date, 0) as days_overdue,
  c.contract_no,
  c.unit_id,
  u.code as unit_code,
  u.branch_id,
  b.name as branch_name,
  c.tenant_id,
  tn.full_name as tenant_name,
  tn.phone as tenant_phone
from public.invoices i
join public.contracts c on c.id = i.contract_id
join public.units u on u.id = c.unit_id
join public.branches b on b.id = u.branch_id
join public.tenants tn on tn.id = c.tenant_id;

revoke all on public.v_invoices from anon;
grant select on public.v_invoices to authenticated;

revoke execute on function public.apply_invoice_tax(uuid, numeric, boolean, numeric) from anon, public;
grant execute on function public.apply_invoice_tax(uuid, numeric, boolean, numeric) to authenticated;
revoke execute on function public.create_invoice(uuid, date, date, date, date, jsonb, text, boolean, boolean, boolean) from anon, public;
revoke execute on function public.set_invoice_tax(uuid, boolean, boolean, boolean) from anon, public;
grant execute on function public.create_invoice(uuid, date, date, date, date, jsonb, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_invoice_tax(uuid, boolean, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
