-- =====================================================================
-- Kepz — เงินประกันนับตามยอดที่ชำระจริง + บันทึกประวัติการแก้ไขเพิ่ม
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0015 แล้ว (รันซ้ำได้)
--
-- 1) บิลที่มีเงินประกัน: ยอดที่ชำระจะนับเป็นเงินประกันก่อน (ไม่ต้องรอชำระครบ)
--    เช่น บิล ค่าเช่า 1,200 + เงินประกัน 2,400 จ่ายมา 1,000 → รับเงินประกันแล้ว 1,000
--    ยกเลิกใบเสร็จ/ยกเลิกบิล → ยอดเงินประกันที่รับจากบิลนั้นปรับตามอัตโนมัติ
-- 2) บันทึกประวัติการแก้ไขของ ผังสถานที่ ราคาห้องแต่ละสาขา และบัญชีผู้ใช้ ด้วย
-- =====================================================================

create or replace function public.sync_invoice_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep     numeric(12,2);
  v_want    numeric(12,2);
  v_have    numeric(12,2);
  v_room    numeric(12,2);
  v_deposit numeric(12,2);
  v_pay     public.payments;
begin
  select coalesce(sum(amount), 0) into v_dep from invoice_items where invoice_id = new.id and item_type = 'deposit';
  if v_dep <= 0 then
    return new;
  end if;

  -- ยอดที่ชำระนับเป็นเงินประกันก่อน
  v_want := case when new.status = 'void' then 0 else least(v_dep, new.paid_amount) end;
  select coalesce(sum(amount), 0) into v_have
  from deposit_transactions where invoice_id = new.id and txn_type = 'receive';
  if v_want = v_have then
    return new;
  end if;

  delete from deposit_transactions where invoice_id = new.id and txn_type = 'receive';
  if v_want <= 0 then
    return new;
  end if;

  select deposit_amount into v_deposit from contracts where id = new.contract_id;
  v_room := v_deposit - public.deposit_balance(new.contract_id);
  v_want := least(v_want, v_room);
  if v_want <= 0 then
    return new;
  end if;

  select * into v_pay from payments where invoice_id = new.id and not is_void order by paid_on desc, created_at desc limit 1;
  insert into deposit_transactions (contract_id, txn_type, amount, txn_date, method, reference, note, invoice_id)
  values (
    new.contract_id, 'receive', v_want, coalesce(v_pay.paid_on, public.today_th()), coalesce(v_pay.method, 'transfer'),
    v_pay.reference,
    'รับพร้อมใบวางบิล ' || new.invoice_no || case when v_want < v_dep then ' (บางส่วน)' else '' end,
    new.id
  );
  return new;
end;
$$;
revoke execute on function public.sync_invoice_deposit() from anon, public;

drop trigger if exists invoices_sync_deposit on public.invoices;
create trigger invoices_sync_deposit after update of status, paid_amount on public.invoices
  for each row execute function public.sync_invoice_deposit();

-- ปรับบิลที่ชำระบางส่วนอยู่แล้วให้นับเงินประกันตามยอดที่จ่าย
update public.invoices set paid_amount = paid_amount
where status = 'partial'
  and exists (select 1 from public.invoice_items x where x.invoice_id = invoices.id and x.item_type = 'deposit');

-- ---------------------------------------------------------------------
-- ประวัติการแก้ไข: รองรับตารางที่ไม่มีคอลัมน์ id
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;
  v_row := coalesce(v_new, v_old);

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(
      v_row ->> 'id',
      v_row ->> 'user_id',
      case when v_row ? 'branch_id' and v_row ? 'unit_type_code' then (v_row ->> 'branch_id') || ':' || (v_row ->> 'unit_type_code') end,
      v_row ->> 'code'
    ),
    lower(tg_op),
    v_old,
    v_new,
    auth.uid()
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['floor_plans', 'branch_unit_types', 'app_users'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
