-- =====================================================================
-- Kepz — แม่แบบสัญญาเช่า (แก้ถ้อยคำได้เอง) + ข้อมูลที่ใช้ในสัญญา
-- วิธีใช้: รันใน Supabase > SQL Editor (รันครั้งเดียว)
-- =====================================================================

-- ค่ากลางที่ใช้ในสัญญา (ทุกสาขา)
alter table public.settings
  add column if not exists lessor_name                text,
  add column if not exists bank_account               text,
  add column if not exists rent_due_day               int not null default 5
    check (rent_due_day between 1 and 31),
  add column if not exists late_fee_per_day           numeric(12,2) not null default 100
    check (late_fee_per_day >= 0),
  add column if not exists reclaim_day                int not null default 30
    check (reclaim_day between 1 and 31),
  add column if not exists overstay_fee_per_day       numeric(12,2) not null default 300
    check (overstay_fee_per_day >= 0),
  -- null = ใช้แม่แบบตั้งต้นของระบบ
  add column if not exists contract_template_storage  text,
  add column if not exists contract_template_parking  text;

-- ค่าเฉพาะสาขา: เว้นว่าง (null) = ใช้ค่ากลางจากตั้งค่า
alter table public.branches
  add column if not exists lessor_name          text,
  add column if not exists bank_account         text,
  add column if not exists rent_due_day         int check (rent_due_day between 1 and 31),
  add column if not exists late_fee_per_day     numeric(12,2) check (late_fee_per_day >= 0),
  add column if not exists reclaim_day          int check (reclaim_day between 1 and 31),
  add column if not exists overstay_fee_per_day numeric(12,2) check (overstay_fee_per_day >= 0);

-- สิ่งของที่เก็บ (ห้องเก็บของ) หรือทะเบียนรถ (ที่จอดรถ)
alter table public.contracts
  add column if not exists purpose text;
