-- =====================================================================
-- Kepz — แก้การลบ/สร้างบัญชีผู้ใช้ผ่านหน้า "ผู้ใช้งาน" ไม่สำเร็จ ("Unexpected failure")
-- วิธีใช้: รันใน Supabase > SQL Editor (รันครั้งเดียว)
--
-- สาเหตุ: เมื่อลบบัญชี Supabase Auth ทำงานด้วย role supabase_auth_admin
-- trigger ที่ตรวจว่า "ต้องมี Owner อย่างน้อย 1 คน" จึงรันด้วยสิทธิ์ของ role นั้น
-- ซึ่งอ่านตาราง app_users ไม่ได้ (RLS) เลยมองไม่เห็น Owner และปฏิเสธการลบทุกครั้ง
-- แก้โดยให้ฟังก์ชันที่ถูกเรียกจาก trigger รันด้วยสิทธิ์ของเจ้าของตาราง (security definer)
-- =====================================================================

create or replace function public.keep_one_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_users where role = 'owner' and is_active) then
    raise exception 'ต้องมี Owner ที่ใช้งานได้อย่างน้อย 1 คน';
  end if;
  return null;
end;
$$;

-- updated_at trigger ไม่ต้องอ่านตารางอื่น แต่กำหนด search_path ให้ปลอดภัยเมื่อรันจาก role อื่น
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.keep_one_owner() from anon, public, authenticated;
