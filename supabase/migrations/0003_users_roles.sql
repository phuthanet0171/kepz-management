-- =====================================================================
-- Kepz — ผู้ใช้หลายคน: Owner / Staff
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0001 และ 0002 แล้ว (รันครั้งเดียว)
--
-- Owner : ทำได้ทุกอย่าง รวมถึงเพิ่ม/ปิดบัญชีผู้ใช้ ตั้งค่า สาขา ผังสถานที่ และรายงาน
-- Staff : จัดการผู้เช่า สัญญา ใบแจ้งหนี้ รับชำระ และสถานะห้องได้ทุกสาขา
--         แต่สร้าง/ลบสาขา ห้อง ผังสถานที่ แก้การตั้งค่า และดูประวัติการแก้ไขไม่ได้
--         (หน้ารายได้รวมและรายงานถูกซ่อนจาก Staff ที่ฝั่งแอป)
-- บัญชีใหม่สร้างโดย Owner ผ่านแอปเท่านั้น ไม่มีการสมัครเอง
-- =====================================================================

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check check (role in ('owner', 'staff'));
alter table public.app_users alter column role set default 'staff';
alter table public.app_users add column if not exists email text;
alter table public.app_users add column if not exists is_active boolean not null default true;

update public.app_users a set email = u.email from auth.users u where u.id = a.user_id and a.email is null;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and role = 'owner' and is_active
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and is_active
  );
$$;

-- ฟังก์ชันงานธุรกิจทั้งหมดเรียก assert_owner() ไว้ตั้งแต่ 0001
-- ตอนนี้เปลี่ยนให้ผ่านสำหรับผู้ใช้ที่ยังใช้งานอยู่ทุกคน ส่วนงานที่เป็นของ Owner เท่านั้น
-- (สร้างสาขา เพิ่มห้อง บันทึกผัง) ถูกกันด้วย RLS ด้านล่าง เพราะทุกฟังก์ชันเป็น security invoker
create or replace function public.assert_owner()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_member() then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;
end;
$$;

-- กันไม่ให้ระบบเหลือ Owner ที่ใช้งานได้น้อยกว่า 1 คน
create or replace function public.keep_one_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.app_users where role = 'owner' and is_active) then
    raise exception 'ต้องมี Owner ที่ใช้งานได้อย่างน้อย 1 คน';
  end if;
  return null;
end;
$$;

drop trigger if exists app_users_keep_owner on public.app_users;
create constraint trigger app_users_keep_owner
  after update or delete on public.app_users
  deferrable initially deferred
  for each row execute function public.keep_one_owner();

create trigger app_users_audit after insert or update or delete on public.app_users
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- RLS: ลบ policy เดิมทั้งหมดแล้วกำหนดใหม่ตามบทบาท
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- app_users: ทุกคนเห็นบัญชีตัวเอง Owner เห็นทุกบัญชี (การแก้ไขทำผ่านเซิร์ฟเวอร์ด้วย secret key เท่านั้น)
create policy app_users_select on public.app_users for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

do $$
declare
  t text;
begin
  -- อ่านได้ทุกคน แก้ได้เฉพาะ Owner
  foreach t in array array['settings', 'unit_types'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_update', t);
  end loop;

  -- อ่านได้ทุกคน เพิ่ม/แก้/ลบได้เฉพาะ Owner
  foreach t in array array['branches', 'floor_plans', 'unit_placements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', t || '_delete', t);
  end loop;

  -- ห้อง: ทุกคนแก้สถานะ/หมายเหตุได้ เพิ่มและลบห้องได้เฉพาะ Owner
  execute 'create policy units_select on public.units for select to authenticated using (public.is_member())';
  execute 'create policy units_update on public.units for update to authenticated using (public.is_member()) with check (public.is_member())';
  execute 'create policy units_insert on public.units for insert to authenticated with check (public.is_owner())';
  execute 'create policy units_delete on public.units for delete to authenticated using (public.is_owner())';

  -- ผู้เช่า: ทุกคนเพิ่ม/แก้ได้ ลบได้เฉพาะ Owner
  execute 'create policy tenants_select on public.tenants for select to authenticated using (public.is_member())';
  execute 'create policy tenants_insert on public.tenants for insert to authenticated with check (public.is_member())';
  execute 'create policy tenants_update on public.tenants for update to authenticated using (public.is_member()) with check (public.is_member())';
  execute 'create policy tenants_delete on public.tenants for delete to authenticated using (public.is_owner())';

  -- งานประจำวัน: ทุกคนอ่าน เพิ่ม แก้ได้ ห้ามลบ
  foreach t in array array['doc_counters', 'contracts', 'invoices', 'payments'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t || '_update', t);
  end loop;

  -- บันทึกแล้วห้ามแก้ไขหรือลบ
  foreach t in array array['contract_renewals', 'deposit_transactions', 'invoice_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member())', t || '_insert', t);
  end loop;
end;
$$;

create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_owner());

-- สลิป
drop policy if exists slips_select on storage.objects;
drop policy if exists slips_insert on storage.objects;
create policy slips_select on storage.objects for select to authenticated
  using (bucket_id = 'slips' and public.is_member());
create policy slips_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and public.is_member());

revoke execute on function public.is_member() from anon, public;
grant execute on function public.is_member() to authenticated;
revoke execute on function public.keep_one_owner() from anon, public;
