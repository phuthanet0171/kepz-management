-- =====================================================================
-- Kepz Management System — โครงสร้างฐานข้อมูล (Supabase / PostgreSQL)
-- วิธีใช้: คัดลอกทั้งไฟล์ไปวางใน Supabase > SQL Editor แล้วกด Run ครั้งเดียว
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ผู้ใช้ระบบ: ตอนนี้มีเฉพาะ owner คนเดียว (โครงสร้างพร้อมเพิ่ม staff ภายหลัง)
-- ---------------------------------------------------------------------
create table public.app_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner')),
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and role = 'owner'
  );
$$;

-- บัญชีแรกที่ถูกสร้างใน Supabase Auth จะได้เป็น owner อัตโนมัติ
-- บัญชีถัดไปจะไม่มีสิทธิ์เข้าถึงข้อมูลใด ๆ
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_users) then
    insert into public.app_users (user_id, role, display_name)
    values (new.id, 'owner', coalesce(new.email, 'Owner'));
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- กรณีสร้างบัญชีไว้ก่อนรันไฟล์นี้ ให้บัญชีที่เก่าที่สุดเป็น owner
insert into public.app_users (user_id, role, display_name)
select id, 'owner', coalesce(email, 'Owner')
from auth.users
where not exists (select 1 from public.app_users)
order by created_at
limit 1;

-- วันที่ปัจจุบันตามเวลาประเทศไทย
create or replace function public.today_th()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Bangkok')::date; $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- ตั้งค่ากิจการ (มีแถวเดียว)
-- ---------------------------------------------------------------------
create table public.settings (
  id                   int primary key default 1 check (id = 1),
  business_name        text not null default 'Kepz Self Storage',
  business_address     text,
  business_phone       text,
  business_email       text,
  tax_id               text,
  vat_enabled          boolean not null default false,
  vat_rate             numeric(5,2) not null default 7 check (vat_rate >= 0 and vat_rate <= 30),
  vat_inclusive        boolean not null default true,
  invoice_prefix       text not null default 'INV' check (invoice_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  receipt_prefix       text not null default 'RC'  check (receipt_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  contract_prefix      text not null default 'CT'  check (contract_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  payment_instructions text,
  contract_terms       text,
  due_soon_days        int not null default 7  check (due_soon_days between 0 and 90),
  expiring_soon_days   int not null default 30 check (expiring_soon_days between 1 and 180),
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ประเภทห้อง / ที่จอด และราคาตั้งต้น
-- ---------------------------------------------------------------------
create table public.unit_types (
  code                  text primary key,
  name                  text not null,
  kind                  text not null check (kind in ('storage', 'parking')),
  size_label            text,
  code_prefix           text not null check (code_prefix ~ '^[A-Za-z0-9]{1,6}$'),
  default_monthly_price numeric(12,2) not null check (default_monthly_price >= 0),
  sort_order            int not null default 0
);

insert into public.unit_types (code, name, kind, size_label, code_prefix, default_monthly_price, sort_order) values
  ('XS',      'ห้อง XS',   'storage', null, 'XS', 1200, 1),
  ('S',       'ห้อง S',    'storage', null, 'S',  1600, 2),
  ('M',       'ห้อง M',    'storage', null, 'M',  1700, 3),
  ('L',       'ห้อง L',    'storage', null, 'L',  4000, 4),
  ('PARKING', 'ที่จอดรถ', 'parking', null, 'P',  1990, 5);

-- ---------------------------------------------------------------------
-- สาขา
-- ---------------------------------------------------------------------
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  address    text,
  phone      text,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index branches_name_key on public.branches (lower(trim(name)));

create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ห้อง / ที่จอด
-- ---------------------------------------------------------------------
create table public.units (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches (id) on delete restrict,
  unit_type_code text not null references public.unit_types (code) on delete restrict,
  code           text not null check (length(trim(code)) between 1 and 20),
  monthly_price  numeric(12,2) check (monthly_price is null or monthly_price >= 0),
  is_maintenance boolean not null default false,
  is_active      boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index units_branch_code_key on public.units (branch_id, upper(trim(code)));
create index units_branch_idx on public.units (branch_id);

create trigger units_updated_at before update on public.units
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ผู้เช่า
-- ---------------------------------------------------------------------
create table public.tenants (
  id                      uuid primary key default gen_random_uuid(),
  tenant_type             text not null default 'individual' check (tenant_type in ('individual', 'company')),
  full_name               text not null check (length(trim(full_name)) > 0),
  phone                   text not null check (length(trim(phone)) > 0),
  email                   text,
  line_id                 text,
  id_number               text,
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  note                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index tenants_name_idx on public.tenants (lower(full_name));

create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- เลขที่เอกสาร: <prefix><ปี พ.ศ.>-<ลำดับ 4 หลัก> เริ่มนับใหม่ทุกปี
-- ---------------------------------------------------------------------
create table public.doc_counters (
  doc_type text not null check (doc_type in ('invoice', 'receipt', 'contract')),
  year_be  int  not null,
  last_no  int  not null default 0,
  primary key (doc_type, year_be)
);

create or replace function public.next_doc_no(p_doc_type text)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_year   int := extract(year from public.today_th())::int + 543;
  v_no     int;
begin
  select case p_doc_type
           when 'invoice'  then invoice_prefix
           when 'receipt'  then receipt_prefix
           when 'contract' then contract_prefix
         end
    into v_prefix
  from public.settings where id = 1;

  if v_prefix is null then
    raise exception 'ไม่รู้จักประเภทเอกสาร %', p_doc_type;
  end if;

  insert into public.doc_counters as c (doc_type, year_be, last_no)
  values (p_doc_type, v_year, 1)
  on conflict (doc_type, year_be) do update set last_no = c.last_no + 1
  returning last_no into v_no;

  return v_prefix || v_year::text || '-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
end;
$$;

-- ---------------------------------------------------------------------
-- สัญญาเช่า
-- ---------------------------------------------------------------------
create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  contract_no    text not null unique,
  unit_id        uuid not null references public.units (id) on delete restrict,
  tenant_id      uuid not null references public.tenants (id) on delete restrict,
  start_date     date not null,
  end_date       date not null,
  billing_cycle  text not null check (billing_cycle in ('monthly', 'semiannual', 'annual')),
  monthly_rent   numeric(12,2) not null check (monthly_rent >= 0),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  status         text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  ended_on       date,
  end_reason     text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date >= start_date),
  check ((status = 'active') = (ended_on is null))
);
-- หนึ่งห้องมีสัญญาที่ใช้งานอยู่ได้เพียงสัญญาเดียว
create unique index contracts_one_active_per_unit on public.contracts (unit_id) where status = 'active';
create index contracts_tenant_idx on public.contracts (tenant_id);

create trigger contracts_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

create table public.contract_renewals (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references public.contracts (id) on delete cascade,
  previous_end_date date not null,
  new_end_date      date not null,
  previous_rent     numeric(12,2) not null,
  new_rent          numeric(12,2) not null,
  note              text,
  created_at        timestamptz not null default now()
);
create index contract_renewals_contract_idx on public.contract_renewals (contract_id);

-- ---------------------------------------------------------------------
-- เงินประกัน: รับ / คืน / หัก
-- ---------------------------------------------------------------------
create table public.deposit_transactions (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete restrict,
  txn_type    text not null check (txn_type in ('receive', 'refund', 'deduct')),
  amount      numeric(12,2) not null check (amount > 0),
  txn_date    date not null,
  method      text check (method in ('transfer', 'credit_card')),
  reference   text,
  note        text,
  created_at  timestamptz not null default now(),
  check (txn_type = 'deduct' or method is not null)
);
create index deposit_transactions_contract_idx on public.deposit_transactions (contract_id);

-- ---------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------
create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null unique,
  contract_id   uuid not null references public.contracts (id) on delete restrict,
  period_start  date,
  period_end    date,
  issue_date    date not null,
  due_date      date not null,
  subtotal      numeric(12,2) not null,
  vat_rate      numeric(5,2) not null default 0,
  vat_inclusive boolean not null default true,
  vat_amount    numeric(12,2) not null default 0,
  total         numeric(12,2) not null check (total >= 0),
  paid_amount   numeric(12,2) not null default 0 check (paid_amount >= 0),
  status        text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'void')),
  note          text,
  void_reason   text,
  voided_at     timestamptz,
  created_at    timestamptz not null default now(),
  check (due_date >= issue_date),
  check ((period_start is null) = (period_end is null)),
  check (period_end is null or period_end >= period_start),
  check (paid_amount <= total)
);
create index invoices_contract_idx on public.invoices (contract_id);
create index invoices_status_due_idx on public.invoices (status, due_date);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  sort_order  int not null default 0,
  item_type   text not null check (item_type in ('rent', 'late_fee', 'other', 'discount')),
  description text not null check (length(trim(description)) > 0),
  quantity    numeric(10,2) not null check (quantity > 0),
  unit_price  numeric(12,2) not null,
  amount      numeric(12,2) not null,
  check ((item_type = 'discount') = (amount < 0) or amount = 0)
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

-- ---------------------------------------------------------------------
-- การรับชำระ (ใบเสร็จ 1 ใบต่อการชำระ 1 ครั้ง)
-- ---------------------------------------------------------------------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  receipt_no  text not null unique,
  invoice_id  uuid not null references public.invoices (id) on delete restrict,
  paid_on     date not null,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null check (method in ('transfer', 'credit_card')),
  reference   text,
  slip_path   text,
  note        text,
  is_void     boolean not null default false,
  void_reason text,
  voided_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_paid_on_idx on public.payments (paid_on);

-- คำนวณยอดชำระและสถานะของใบแจ้งหนี้ใหม่ทุกครั้งที่การชำระเปลี่ยน
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
    raise exception 'ยอดรับชำระรวม (% บาท) เกินยอดใบแจ้งหนี้ (% บาท)', v_paid, v_total;
  end if;

  if v_status = 'void' and v_paid > 0 then
    raise exception 'ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว ไม่สามารถรับชำระได้';
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

create trigger payments_recompute_invoice
  after insert or update or delete on public.payments
  for each row execute function public.recompute_invoice_paid();

-- ---------------------------------------------------------------------
-- ประวัติการแก้ไขข้อมูล
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_changed_at_idx on public.audit_logs (changed_at desc);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(v_new, v_old) ->> case when tg_table_name = 'unit_types' then 'code' else 'id' end,
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
  foreach t in array array[
    'settings', 'unit_types', 'branches', 'units', 'tenants', 'contracts',
    'contract_renewals', 'deposit_transactions', 'invoices', 'invoice_items', 'payments'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end;
$$;

-- =====================================================================
-- ฟังก์ชันงานธุรกิจ (เรียกจากแอปผ่าน supabase.rpc)
-- ทุกฟังก์ชันเป็น security invoker จึงอยู่ภายใต้ RLS ด้านล่าง
-- =====================================================================

create or replace function public.assert_owner()
returns void
language plpgsql
stable
as $$
begin
  if not public.is_owner() then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;
end;
$$;

-- เพิ่มห้องตามจำนวน โดยรันเลขต่อจากรหัสเดิมของประเภทนั้นในสาขา เช่น XS-01, XS-02
create or replace function public.add_units(p_branch_id uuid, p_unit_type_code text, p_count int)
returns int
language plpgsql
as $$
declare
  v_prefix text;
  v_max    int;
  i        int;
  v_no     int;
begin
  perform public.assert_owner();

  if p_count is null or p_count < 0 or p_count > 500 then
    raise exception 'จำนวนต้องอยู่ระหว่าง 0 ถึง 500';
  end if;
  if p_count = 0 then
    return 0;
  end if;

  select code_prefix into v_prefix from public.unit_types where code = p_unit_type_code;
  if v_prefix is null then
    raise exception 'ไม่พบประเภทห้อง %', p_unit_type_code;
  end if;

  perform 1 from public.branches where id = p_branch_id for update;
  if not found then
    raise exception 'ไม่พบสาขา';
  end if;

  select coalesce(max(substring(upper(code) from '^' || upper(v_prefix) || '-([0-9]+)$')::int), 0)
    into v_max
  from public.units
  where branch_id = p_branch_id;

  for i in 1..p_count loop
    v_no := v_max + i;
    insert into public.units (branch_id, unit_type_code, code)
    values (
      p_branch_id,
      p_unit_type_code,
      upper(v_prefix) || '-' || lpad(v_no::text, greatest(2, length(v_no::text)), '0')
    );
  end loop;

  return p_count;
end;
$$;

-- สร้างสาขาพร้อมห้องตามจำนวนที่ระบุ เช่น p_counts = {"XS": 10, "S": 8, "PARKING": 20}
create or replace function public.create_branch(
  p_name text,
  p_address text,
  p_phone text,
  p_note text,
  p_counts jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  t    record;
begin
  perform public.assert_owner();

  insert into public.branches (name, address, phone, note)
  values (trim(p_name), nullif(trim(p_address), ''), nullif(trim(p_phone), ''), nullif(trim(p_note), ''))
  returning id into v_id;

  for t in select code from public.unit_types order by sort_order loop
    perform public.add_units(v_id, t.code, coalesce((p_counts ->> t.code)::int, 0));
  end loop;

  return v_id;
end;
$$;

create or replace function public.billing_cycle_months(p_cycle text)
returns int
language sql
immutable
as $$
  select case p_cycle when 'monthly' then 1 when 'semiannual' then 6 when 'annual' then 12 end;
$$;

-- รอบบิลถัดไปของสัญญา นับรอบจากวันเริ่มสัญญาเสมอ (ไม่เลื่อนวันเมื่อเจอเดือนสั้น)
-- ไม่คืนแถวเมื่อออกบิลค่าเช่าครบถึงวันสิ้นสุดสัญญาแล้ว
-- months = จำนวนเดือนที่คิดค่าเช่า (เดือนที่ไม่เต็มนับเป็น 1 เดือน)
-- is_partial = รอบนี้สั้นกว่ารอบปกติ (เช่นรอบสุดท้ายก่อนหมดสัญญา) ควรตรวจยอดก่อนออกบิล
create or replace function public.next_billing_period(p_contract_id uuid)
returns table (period_start date, period_end date, months int, is_partial boolean)
language plpgsql
stable
as $$
declare
  c          public.contracts;
  v_m        int;
  v_last_end date;
  v_k        int := 0;
  v_anchor   date;
  v_next     date;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return;
  end if;

  v_m := public.billing_cycle_months(c.billing_cycle);

  select max(i.period_end) into v_last_end
  from public.invoices i
  where i.contract_id = c.id
    and i.status <> 'void'
    and i.period_end is not null
    and exists (select 1 from public.invoice_items it where it.invoice_id = i.id and it.item_type = 'rent');

  period_start := coalesce(v_last_end + 1, c.start_date);
  if period_start > c.end_date then
    return;
  end if;

  -- หาจุดตัดรอบ v_anchor <= period_start < v_next
  loop
    v_anchor := (c.start_date + make_interval(months => v_k * v_m))::date;
    v_next   := (c.start_date + make_interval(months => (v_k + 1) * v_m))::date;
    exit when v_next > period_start;
    v_k := v_k + 1;
  end loop;

  period_end := least(v_next - 1, c.end_date);
  is_partial := period_start <> v_anchor or period_end <> v_next - 1;

  -- นับเดือนตามจุดตัดรายเดือนที่ทับกับช่วง [period_start, period_end]
  months := 0;
  v_k := 0;
  loop
    v_anchor := (c.start_date + make_interval(months => v_k))::date;
    exit when v_anchor > period_end;
    v_next := (c.start_date + make_interval(months => v_k + 1))::date;
    if v_next > period_start then
      months := months + 1;
    end if;
    v_k := v_k + 1;
  end loop;

  return next;
end;
$$;

create or replace function public.create_contract(
  p_unit_id uuid,
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date,
  p_billing_cycle text,
  p_monthly_rent numeric,
  p_deposit_amount numeric,
  p_note text,
  p_deposit_received_on date,
  p_deposit_method text,
  p_deposit_reference text
)
returns uuid
language plpgsql
as $$
declare
  u    public.units;
  v_id uuid;
begin
  perform public.assert_owner();

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
  if exists (select 1 from public.contracts where unit_id = p_unit_id and status = 'active') then
    raise exception 'ห้อง % มีผู้เช่าอยู่แล้ว', u.code;
  end if;

  insert into public.contracts (
    contract_no, unit_id, tenant_id, start_date, end_date,
    billing_cycle, monthly_rent, deposit_amount, note
  ) values (
    public.next_doc_no('contract'), p_unit_id, p_tenant_id, p_start_date, p_end_date,
    p_billing_cycle, p_monthly_rent, coalesce(p_deposit_amount, 0), nullif(trim(p_note), '')
  ) returning id into v_id;

  if p_deposit_received_on is not null and coalesce(p_deposit_amount, 0) > 0 then
    insert into public.deposit_transactions (contract_id, txn_type, amount, txn_date, method, reference)
    values (v_id, 'receive', p_deposit_amount, p_deposit_received_on, p_deposit_method, nullif(trim(p_deposit_reference), ''));
  end if;

  return v_id;
end;
$$;

create or replace function public.renew_contract(
  p_contract_id uuid,
  p_new_end_date date,
  p_new_rent numeric,
  p_note text
)
returns void
language plpgsql
as $$
declare
  c public.contracts;
begin
  perform public.assert_owner();

  select * into c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'ไม่พบสัญญา';
  end if;
  if c.status <> 'active' then
    raise exception 'ต่อสัญญาได้เฉพาะสัญญาที่ยังใช้งานอยู่';
  end if;
  if p_new_end_date <= c.end_date then
    raise exception 'วันสิ้นสุดใหม่ต้องอยู่หลังวันสิ้นสุดเดิม (%)', to_char(c.end_date, 'DD/MM/YYYY');
  end if;
  if p_new_rent is null or p_new_rent < 0 then
    raise exception 'ค่าเช่าไม่ถูกต้อง';
  end if;

  insert into public.contract_renewals (contract_id, previous_end_date, new_end_date, previous_rent, new_rent, note)
  values (c.id, c.end_date, p_new_end_date, c.monthly_rent, p_new_rent, nullif(trim(p_note), ''));

  update public.contracts
  set end_date = p_new_end_date, monthly_rent = p_new_rent
  where id = c.id;
end;
$$;

create or replace function public.end_contract(
  p_contract_id uuid,
  p_status text,
  p_ended_on date,
  p_reason text
)
returns void
language plpgsql
as $$
declare
  c public.contracts;
begin
  perform public.assert_owner();

  if p_status not in ('ended', 'cancelled') then
    raise exception 'สถานะไม่ถูกต้อง';
  end if;

  select * into c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'ไม่พบสัญญา';
  end if;
  if c.status <> 'active' then
    raise exception 'สัญญานี้สิ้นสุดไปแล้ว';
  end if;
  if p_ended_on is null or p_ended_on < c.start_date then
    raise exception 'วันที่สิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา';
  end if;

  update public.contracts
  set status = p_status, ended_on = p_ended_on, end_reason = nullif(trim(p_reason), '')
  where id = c.id;
end;
$$;

create or replace function public.deposit_balance(p_contract_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(case txn_type when 'receive' then amount else -amount end), 0)
  from public.deposit_transactions
  where contract_id = p_contract_id;
$$;

create or replace function public.record_deposit(
  p_contract_id uuid,
  p_txn_type text,
  p_amount numeric,
  p_txn_date date,
  p_method text,
  p_reference text,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  c         public.contracts;
  v_balance numeric;
  v_id      uuid;
begin
  perform public.assert_owner();

  select * into c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'ไม่พบสัญญา';
  end if;

  v_balance := public.deposit_balance(c.id);

  if p_txn_type = 'receive' then
    if v_balance + p_amount > c.deposit_amount then
      raise exception 'ยอดรับเงินประกันรวมเกินยอดที่ระบุในสัญญา (% บาท)', c.deposit_amount;
    end if;
  elsif p_txn_type in ('refund', 'deduct') then
    if p_amount > v_balance then
      raise exception 'ยอดเกินเงินประกันคงเหลือ (% บาท)', v_balance;
    end if;
  else
    raise exception 'ประเภทรายการไม่ถูกต้อง';
  end if;

  insert into public.deposit_transactions (contract_id, txn_type, amount, txn_date, method, reference, note)
  values (
    c.id, p_txn_type, p_amount, p_txn_date,
    case when p_txn_type = 'deduct' then null else p_method end,
    nullif(trim(p_reference), ''), nullif(trim(p_note), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- สร้างใบแจ้งหนี้ p_items = [{"item_type":"rent","description":"...","quantity":1,"unit_price":1200}, ...]
create or replace function public.create_invoice(
  p_contract_id uuid,
  p_period_start date,
  p_period_end date,
  p_issue_date date,
  p_due_date date,
  p_items jsonb,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  c         public.contracts;
  s         public.settings;
  v_id      uuid;
  v_sum     numeric(12,2) := 0;
  v_vat     numeric(12,2) := 0;
  v_sub     numeric(12,2);
  v_total   numeric(12,2);
  v_rate    numeric(5,2);
  v_has_rent boolean := false;
  it        jsonb;
  v_qty     numeric;
  v_price   numeric;
  v_amount  numeric(12,2);
  v_type    text;
  v_order   int := 0;
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
  v_rate := case when s.vat_enabled then s.vat_rate else 0 end;

  insert into public.invoices (
    invoice_no, contract_id, period_start, period_end, issue_date, due_date,
    subtotal, vat_rate, vat_inclusive, vat_amount, total, note
  ) values (
    public.next_doc_no('invoice'), c.id, p_period_start, p_period_end, p_issue_date, p_due_date,
    0, v_rate, s.vat_inclusive, 0, 0, nullif(trim(p_note), '')
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
    raise exception 'มีใบแจ้งหนี้ค่าเช่าที่ครอบคลุมช่วง % ถึง % อยู่แล้ว',
      to_char(p_period_start, 'DD/MM/YYYY'), to_char(p_period_end, 'DD/MM/YYYY');
  end if;

  if v_rate = 0 then
    v_sub := v_sum; v_vat := 0; v_total := v_sum;
  elsif s.vat_inclusive then
    v_total := v_sum;
    v_vat   := round(v_sum * v_rate / (100 + v_rate), 2);
    v_sub   := v_total - v_vat;
  else
    v_sub   := v_sum;
    v_vat   := round(v_sum * v_rate / 100, 2);
    v_total := v_sub + v_vat;
  end if;

  update public.invoices
  set subtotal = v_sub, vat_amount = v_vat, total = v_total,
      status = case when v_total = 0 then 'paid' else 'unpaid' end
  where id = v_id;

  return v_id;
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
    raise exception 'ไม่พบใบแจ้งหนี้';
  end if;
  if inv.status = 'void' then
    raise exception 'ใบแจ้งหนี้นี้ถูกยกเลิกไปแล้ว';
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
    raise exception 'ไม่พบใบแจ้งหนี้';
  end if;
  if inv.status = 'void' then
    raise exception 'ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว';
  end if;
  if inv.status = 'paid' then
    raise exception 'ใบแจ้งหนี้นี้ชำระครบแล้ว';
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

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  p public.payments;
begin
  perform public.assert_owner();

  select * into p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'ไม่พบรายการชำระ';
  end if;
  if p.is_void then
    raise exception 'รายการนี้ถูกยกเลิกไปแล้ว';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการยกเลิก';
  end if;

  update public.payments
  set is_void = true, void_reason = trim(p_reason), voided_at = now()
  where id = p.id;
end;
$$;

-- =====================================================================
-- Views (security_invoker: ใช้สิทธิ์ของผู้เรียก จึงอยู่ภายใต้ RLS)
-- =====================================================================

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
  coalesce(u.monthly_price, t.default_monthly_price) as effective_price,
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
left join public.contracts c on c.unit_id = u.id and c.status = 'active'
left join public.tenants tn on tn.id = c.tenant_id;

create or replace view public.v_invoices
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

create or replace view public.v_contracts
with (security_invoker = true)
as
select
  c.*,
  u.code as unit_code,
  u.unit_type_code,
  ut.name as unit_type_name,
  u.branch_id,
  b.name as branch_name,
  tn.full_name as tenant_name,
  tn.phone as tenant_phone,
  public.deposit_balance(c.id) as deposit_balance,
  (c.status = 'active' and c.end_date <= public.today_th() + (select expiring_soon_days from public.settings where id = 1))
    as is_expiring,
  (select coalesce(sum(i.total - i.paid_amount), 0)
     from public.invoices i
    where i.contract_id = c.id and i.status in ('unpaid', 'partial')) as outstanding
from public.contracts c
join public.units u on u.id = c.unit_id
join public.unit_types ut on ut.code = u.unit_type_code
join public.branches b on b.id = u.branch_id
join public.tenants tn on tn.id = c.tenant_id;

-- สัญญาที่ใช้งานอยู่พร้อมรอบบิลถัดไป
create or replace view public.v_billing_due
with (security_invoker = true)
as
select
  vc.id as contract_id,
  vc.contract_no,
  vc.unit_code,
  vc.branch_id,
  vc.branch_name,
  vc.tenant_name,
  vc.tenant_phone,
  vc.billing_cycle,
  vc.monthly_rent,
  vc.end_date,
  p.period_start,
  p.period_end,
  p.months,
  p.is_partial,
  (p.period_start <= public.today_th() + (select due_soon_days from public.settings where id = 1)) as is_due
from public.v_contracts vc
cross join lateral public.next_billing_period(vc.id) p
where vc.status = 'active';

-- =====================================================================
-- Row Level Security: เฉพาะ owner ที่ล็อกอินแล้ว
-- ตารางการเงินไม่มีสิทธิ์ลบ (ใช้การยกเลิกแทน)
-- =====================================================================

alter table public.app_users            enable row level security;
alter table public.settings             enable row level security;
alter table public.unit_types           enable row level security;
alter table public.branches             enable row level security;
alter table public.units                enable row level security;
alter table public.tenants              enable row level security;
alter table public.doc_counters         enable row level security;
alter table public.contracts            enable row level security;
alter table public.contract_renewals    enable row level security;
alter table public.deposit_transactions enable row level security;
alter table public.invoices             enable row level security;
alter table public.invoice_items        enable row level security;
alter table public.payments             enable row level security;
alter table public.audit_logs           enable row level security;

create policy app_users_self on public.app_users
  for select to authenticated using (user_id = auth.uid());

create policy settings_select on public.settings for select to authenticated using (public.is_owner());
create policy settings_update on public.settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy unit_types_select on public.unit_types for select to authenticated using (public.is_owner());
create policy unit_types_update on public.unit_types for update to authenticated using (public.is_owner()) with check (public.is_owner());

do $$
declare
  t text;
begin
  -- ตารางที่ owner อ่าน เพิ่ม แก้ และลบได้ (FK กันการลบข้อมูลที่ถูกอ้างถึง)
  foreach t in array array['branches', 'units', 'tenants'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_owner())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', t || '_delete', t);
  end loop;

  -- ตารางที่อ่าน เพิ่ม แก้ได้ แต่ห้ามลบ
  foreach t in array array['doc_counters', 'contracts', 'invoices', 'payments'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_owner())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_update', t);
  end loop;

  -- ตารางที่บันทึกแล้วห้ามแก้ไขหรือลบ
  foreach t in array array['contract_renewals', 'deposit_transactions', 'invoice_items'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_owner())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_insert', t);
  end loop;
end;
$$;

create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_owner());

-- ผู้ที่ไม่ได้ล็อกอินไม่มีสิทธิ์ใด ๆ
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;

-- =====================================================================
-- ที่เก็บสลิปการโอน (private bucket)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy slips_select on storage.objects for select to authenticated
  using (bucket_id = 'slips' and public.is_owner());
create policy slips_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and public.is_owner());
