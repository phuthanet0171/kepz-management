-- =====================================================================
-- Kepz — ลบถาวรพร้อมประวัติ (เฉพาะ Owner)
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0001–0003 แล้ว (รันครั้งเดียว)
--
-- ลบผู้เช่าหรือสาขา พร้อมสัญญา ใบแจ้งหนี้ ใบเสร็จ เงินประกัน และประวัติการต่อสัญญาที่เกี่ยวข้อง
-- กู้คืนไม่ได้ (ยกเว้นข้อมูลที่ยังอยู่ในตาราง audit_logs) เลขเอกสารที่ถูกลบจะไม่ถูกนำกลับมาใช้
-- ตารางการเงินปกติห้ามลบผ่าน RLS ฟังก์ชันเหล่านี้จึงเป็น security definer และตรวจสิทธิ์ Owner เอง
-- =====================================================================

-- สรุปสิ่งที่จะถูกลบ ใช้แสดงให้ผู้ใช้ยืนยันก่อน
create or replace function public.purge_preview(p_kind text, p_id uuid)
returns table (contracts int, active_contracts int, invoices int, payments int, paid_total numeric, units int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contracts uuid[];
begin
  if not public.is_owner() then
    raise exception 'ทำรายการนี้ได้เฉพาะ Owner' using errcode = '42501';
  end if;

  if p_kind = 'tenant' then
    select coalesce(array_agg(id), '{}') into v_contracts from contracts where tenant_id = p_id;
    units := 0;
  elsif p_kind = 'branch' then
    select coalesce(array_agg(c.id), '{}') into v_contracts
    from contracts c join units u on u.id = c.unit_id where u.branch_id = p_id;
    select count(*) into units from units where branch_id = p_id;
  else
    raise exception 'ประเภทไม่ถูกต้อง';
  end if;

  contracts := cardinality(v_contracts);
  select count(*) into active_contracts from contracts c where c.id = any (v_contracts) and c.status = 'active';
  select count(*) into invoices from invoices i where i.contract_id = any (v_contracts);
  select count(*), coalesce(sum(p.amount) filter (where not p.is_void), 0)
    into payments, paid_total
  from payments p join invoices i on i.id = p.invoice_id
  where i.contract_id = any (v_contracts);

  return next;
end;
$$;

-- ลบข้อมูลการเงินทั้งหมดของสัญญาที่ระบุ คืนรายการ path ของสลิปเพื่อให้แอปลบไฟล์ต่อ
create or replace function public.purge_contracts_internal(p_contracts uuid[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slips text[];
begin
  select coalesce(array_agg(p.slip_path) filter (where p.slip_path is not null), '{}')
    into v_slips
  from payments p join invoices i on i.id = p.invoice_id
  where i.contract_id = any (p_contracts);

  delete from payments p using invoices i where p.invoice_id = i.id and i.contract_id = any (p_contracts);
  delete from invoices where contract_id = any (p_contracts);          -- invoice_items ถูกลบตาม (cascade)
  delete from deposit_transactions where contract_id = any (p_contracts);
  delete from contracts where id = any (p_contracts);                 -- contract_renewals ถูกลบตาม (cascade)

  return v_slips;
end;
$$;

create or replace function public.purge_tenant(p_tenant_id uuid, p_confirm_name text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_contracts uuid[];
  v_slips text[];
begin
  if not public.is_owner() then
    raise exception 'ทำรายการนี้ได้เฉพาะ Owner' using errcode = '42501';
  end if;

  select full_name into v_name from tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'ไม่พบผู้เช่า';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(v_name) then
    raise exception 'ชื่อที่พิมพ์ยืนยันไม่ตรงกัน';
  end if;

  select coalesce(array_agg(id), '{}') into v_contracts from contracts where tenant_id = p_tenant_id;
  v_slips := public.purge_contracts_internal(v_contracts);
  delete from tenants where id = p_tenant_id;
  return v_slips;
end;
$$;

create or replace function public.purge_branch(p_branch_id uuid, p_confirm_name text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_contracts uuid[];
  v_slips text[];
begin
  if not public.is_owner() then
    raise exception 'ทำรายการนี้ได้เฉพาะ Owner' using errcode = '42501';
  end if;

  select name into v_name from branches where id = p_branch_id for update;
  if not found then
    raise exception 'ไม่พบสาขา';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(v_name) then
    raise exception 'ชื่อที่พิมพ์ยืนยันไม่ตรงกัน';
  end if;

  select coalesce(array_agg(c.id), '{}') into v_contracts
  from contracts c join units u on u.id = c.unit_id where u.branch_id = p_branch_id;
  v_slips := public.purge_contracts_internal(v_contracts);

  delete from floor_plans where branch_id = p_branch_id;   -- unit_placements ถูกลบตาม (cascade)
  delete from units where branch_id = p_branch_id;
  delete from branches where id = p_branch_id;
  -- ผู้เช่ายังอยู่ในระบบ (อาจเช่าสาขาอื่นอยู่) ลบแยกได้ที่หน้าผู้เช่า
  return v_slips;
end;
$$;

revoke execute on function public.purge_preview(text, uuid) from anon, public;
revoke execute on function public.purge_contracts_internal(uuid[]) from anon, public, authenticated;
revoke execute on function public.purge_tenant(uuid, text) from anon, public;
revoke execute on function public.purge_branch(uuid, text) from anon, public;
grant execute on function public.purge_preview(text, uuid) to authenticated;
grant execute on function public.purge_tenant(uuid, text) to authenticated;
grant execute on function public.purge_branch(uuid, text) to authenticated;
