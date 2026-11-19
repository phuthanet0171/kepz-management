-- =====================================================================
-- Kepz — ราคาและขนาดห้องแยกตามสาขา (แต่ละสาขาตั้งราคาเองได้)
-- วิธีใช้: รันใน Supabase > SQL Editor (รันครั้งเดียว)
-- สาขาเดิมจะได้ราคาเท่าเดิม (คัดลอกจากราคาตั้งต้นเดิมให้อัตโนมัติ)
-- ลำดับราคาที่ใช้: ราคาเฉพาะห้อง → ราคาของสาขา → ราคาตั้งต้นของระบบ
-- =====================================================================

create table if not exists public.branch_unit_types (
  branch_id      uuid not null references public.branches (id) on delete cascade,
  unit_type_code text not null references public.unit_types (code) on delete cascade,
  monthly_price  numeric(12,2) not null check (monthly_price >= 0),
  size_label     text check (size_label is null or length(size_label) <= 60),
  primary key (branch_id, unit_type_code)
);

-- สาขาเดิม: ใช้ราคาและขนาดเดิม
insert into public.branch_unit_types (branch_id, unit_type_code, monthly_price, size_label)
select b.id, t.code, t.default_monthly_price, t.size_label
from public.branches b cross join public.unit_types t
on conflict do nothing;

-- สาขาใหม่: ใส่ราคาตั้งต้นให้ก่อน แล้วหน้าเว็บจะบันทึกราคาที่กรอกทับ
create or replace function public.branch_unit_types_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_unit_types (branch_id, unit_type_code, monthly_price, size_label)
  select new.id, t.code, t.default_monthly_price, t.size_label from public.unit_types t
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists branches_unit_types_defaults on public.branches;
create trigger branches_unit_types_defaults after insert on public.branches
  for each row execute function public.branch_unit_types_defaults();
revoke execute on function public.branch_unit_types_defaults() from anon, public;

alter table public.branch_unit_types enable row level security;
drop policy if exists branch_unit_types_select on public.branch_unit_types;
drop policy if exists branch_unit_types_write on public.branch_unit_types;
create policy branch_unit_types_select on public.branch_unit_types for select to authenticated using (public.is_member());
create policy branch_unit_types_write on public.branch_unit_types for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
revoke all on public.branch_unit_types from anon, public;
grant select, insert, update, delete on public.branch_unit_types to authenticated;

-- ราคาที่ใช้จริงของห้อง: ราคาเฉพาะห้อง → ราคาของสาขา → ราคาตั้งต้น
create or replace view public.v_units
with (security_invoker = true)
as
select
  u.id,
  u.branch_id,
  b.name as branch_name,
  u.unit_type_code,
  t.name as unit_type_name,
  t.kind,
  t.sort_order as type_sort,
  u.code,
  u.monthly_price,
  coalesce(u.monthly_price, bt.monthly_price, t.default_monthly_price) as effective_price,
  u.is_maintenance,
  u.is_active,
  u.note,
  c.id as contract_id,
  c.contract_no,
  c.end_date as contract_end_date,
  c.monthly_rent as contract_rent,
  tn.id as tenant_id,
  tn.full_name as tenant_name,
  tn.phone as tenant_phone,
  case
    when not u.is_active then 'inactive'
    when c.id is not null then 'occupied'
    when u.is_maintenance then 'maintenance'
    else 'available'
  end as status,
  (c.id is not null and c.end_date <= public.today_th() + (select expiring_soon_days from public.settings where id = 1))
    as is_expiring
from public.units u
join public.branches b on b.id = u.branch_id
join public.unit_types t on t.code = u.unit_type_code
left join public.branch_unit_types bt on bt.branch_id = u.branch_id and bt.unit_type_code = u.unit_type_code
left join public.contracts c on c.unit_id = u.id and c.status = 'active'
left join public.tenants tn on tn.id = c.tenant_id;

notify pgrst, 'reload schema';
