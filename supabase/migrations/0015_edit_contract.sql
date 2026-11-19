-- =====================================================================
-- Kepz — แก้ไขสัญญาที่ทำผิด (ผู้เช่า ห้อง ค่าเช่า เงินประกัน วันที่ รอบชำระ)
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0014 แล้ว (รันครั้งเดียว)
--
-- แก้ได้เมื่อสัญญายังใช้งานอยู่และยังไม่มีการรับชำระ (ไม่มีใบเสร็จที่ใช้งานอยู่)
-- ใบวางบิลที่ยังไม่ชำระของสัญญานี้จะถูกยกเลิก แล้วหน้าเว็บออกใบวางบิลแรกใหม่ตามข้อมูลที่แก้
-- =====================================================================

create or replace function public.update_contract_core(
  p_contract_id uuid,
  p_unit_id uuid,
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date,
  p_billing_cycle text,
  p_monthly_rent numeric,
  p_deposit_amount numeric
)
returns int
language plpgsql
as $$
declare
  c       public.contracts;
  u       public.units;
  v_voids int;
begin
  perform public.assert_owner();

  select * into c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'ไม่พบสัญญา';
  end if;
  if c.status <> 'active' then
    raise exception 'แก้ไขได้เฉพาะสัญญาที่ยังใช้งานอยู่';
  end if;
  if exists (
    select 1 from public.payments p join public.invoices i on i.id = p.invoice_id
    where i.contract_id = c.id and not p.is_void
  ) then
    raise exception 'สัญญานี้มีการรับชำระแล้ว แก้ผู้เช่า ห้อง ค่าเช่า หรือเงินประกันไม่ได้ ต้องยกเลิกใบเสร็จก่อน';
  end if;

  if p_end_date is null or p_start_date is null or p_end_date < p_start_date then
    raise exception 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา';
  end if;
  if p_billing_cycle not in ('monthly', 'semiannual', 'annual') then
    raise exception 'รอบการชำระไม่ถูกต้อง';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'ค่าเช่าต่อเดือนต้องมากกว่า 0';
  end if;
  if p_deposit_amount is null or p_deposit_amount < 0 then
    raise exception 'ยอดเงินประกันไม่ถูกต้อง';
  end if;
  if p_deposit_amount < public.deposit_balance(c.id) then
    raise exception 'เงินประกันต้องไม่น้อยกว่ายอดที่รับไว้แล้ว (% บาท)', public.deposit_balance(c.id);
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'ไม่พบผู้เช่า';
  end if;

  if p_unit_id <> c.unit_id then
    select * into u from public.units where id = p_unit_id for update;
    if not found then
      raise exception 'ไม่พบห้อง';
    end if;
    if not u.is_active then
      raise exception 'ห้อง % ถูกปิดใช้งานแล้ว', u.code;
    end if;
    if u.is_maintenance then
      raise exception 'ห้อง % อยู่ระหว่างปิดปรับปรุง', u.code;
    end if;
    if exists (select 1 from public.contracts where unit_id = p_unit_id and status = 'active' and id <> c.id) then
      raise exception 'ห้อง % มีผู้เช่าอยู่แล้ว', u.code;
    end if;
  end if;

  -- ใบวางบิลที่ออกตามข้อมูลเดิมยกเลิกทั้งหมด (ยังไม่มีการชำระ)
  update public.invoices
  set status = 'void', void_reason = 'แก้ไขข้อมูลสัญญา', voided_at = now()
  where contract_id = c.id and status in ('unpaid', 'partial');
  get diagnostics v_voids = row_count;

  update public.contracts
  set unit_id = p_unit_id,
      tenant_id = p_tenant_id,
      start_date = p_start_date,
      end_date = p_end_date,
      billing_cycle = p_billing_cycle,
      monthly_rent = p_monthly_rent,
      deposit_amount = p_deposit_amount
  where id = c.id;

  return v_voids;
end;
$$;

revoke execute on function public.update_contract_core(uuid, uuid, uuid, date, date, text, numeric, numeric) from anon, public;
grant execute on function public.update_contract_core(uuid, uuid, uuid, date, date, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
