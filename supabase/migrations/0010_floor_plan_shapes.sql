-- =====================================================================
-- Kepz — ผังสถานที่: รูปทรงห้อง (สี่เหลี่ยม/วงกลม), สัญลักษณ์บนผัง และสร้างห้องใหม่จากผังได้เลย
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0002_floor_plans.sql แล้ว (รันครั้งเดียว)
-- ผังเดิมที่จัดไว้ยังอยู่ครบ (ห้องเดิมเป็นสี่เหลี่ยมทั้งหมด)
-- =====================================================================

-- รูปทรงของห้องบนผัง
alter table public.unit_placements
  add column if not exists shape text not null default 'rect';
alter table public.unit_placements drop constraint if exists unit_placements_shape_check;
alter table public.unit_placements
  add constraint unit_placements_shape_check check (shape in ('rect', 'circle'));

-- สัญลักษณ์ที่ไม่ใช่ห้องเช่า เช่น ทางเข้า ลิฟต์ บันได เสา ป้ายโซน
create table if not exists public.plan_objects (
  id            uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references public.floor_plans (id) on delete cascade,
  label         text not null default '' check (length(label) <= 40),
  shape         text not null default 'rect' check (shape in ('rect', 'circle')),
  color         text not null default 'gray'
                check (color in ('gray', 'yellow', 'black', 'blue', 'green', 'red', 'orange', 'none')),
  x             int not null check (x >= 0),
  y             int not null check (y >= 0),
  w             int not null check (w between 1 and 300),
  h             int not null check (h between 1 and 300)
);
create index if not exists plan_objects_plan_idx on public.plan_objects (floor_plan_id);

alter table public.plan_objects enable row level security;
drop policy if exists plan_objects_select on public.plan_objects;
drop policy if exists plan_objects_write on public.plan_objects;
-- ทุกคนในระบบดูผังได้ (หน้า "ห้องและที่จอด") แก้ได้เฉพาะ Owner
create policy plan_objects_select on public.plan_objects for select to authenticated using (public.is_member());
create policy plan_objects_write on public.plan_objects for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
revoke all on public.plan_objects from anon, public;
grant select, insert, update, delete on public.plan_objects to authenticated;

-- บันทึกผังทั้งแผ่นในครั้งเดียว
-- p_placements = [{"unit_id","x","y","w","h","shape"}]       ตำแหน่งห้องบนผังนี้ (ห้องที่ไม่อยู่ในรายการจะถูกนำออกจากผัง)
-- p_objects    = [{"id","label","shape","color","x","y","w","h"}] สัญลักษณ์ทั้งหมดของผังนี้
-- p_new_units  = [{"id","code","unit_type_code"}]            ห้องใหม่ที่วาดบนผัง (id สร้างจากหน้าจอ)
-- p_renames    = [{"id","code"}]                             เปลี่ยนชื่อ (รหัส) ห้องเดิม
create or replace function public.save_floor_plan_v2(
  p_plan_id uuid,
  p_name text,
  p_cols int,
  p_rows int,
  p_placements jsonb,
  p_objects jsonb,
  p_new_units jsonb,
  p_renames jsonb
)
returns void
language plpgsql
as $$
declare
  v_branch uuid;
  v_ids uuid[];
  e jsonb;
  v_code text;
begin
  perform public.assert_owner();

  select branch_id into v_branch from public.floor_plans where id = p_plan_id for update;
  if v_branch is null then
    raise exception 'ไม่พบผัง';
  end if;

  if jsonb_typeof(p_placements) <> 'array' or jsonb_typeof(p_objects) <> 'array'
     or jsonb_typeof(p_new_units) <> 'array' or jsonb_typeof(p_renames) <> 'array' then
    raise exception 'ข้อมูลผังไม่ถูกต้อง';
  end if;

  -- เปลี่ยนชื่อห้องเดิม (เฉพาะห้องของสาขานี้)
  for e in select * from jsonb_array_elements(p_renames) loop
    v_code := upper(trim(e ->> 'code'));
    if v_code is null or length(v_code) not between 1 and 20 then
      raise exception 'ชื่อห้องต้องมี 1–20 ตัวอักษร';
    end if;
    update public.units set code = v_code
    where id = (e ->> 'id')::uuid and branch_id = v_branch and code is distinct from v_code;
  end loop;

  -- สร้างห้องใหม่ที่วาดบนผัง
  for e in select * from jsonb_array_elements(p_new_units) loop
    v_code := upper(trim(e ->> 'code'));
    if v_code is null or length(v_code) not between 1 and 20 then
      raise exception 'ชื่อห้องต้องมี 1–20 ตัวอักษร';
    end if;
    if not exists (select 1 from public.unit_types where code = e ->> 'unit_type_code') then
      raise exception 'ไม่พบประเภทห้อง %', e ->> 'unit_type_code';
    end if;
    insert into public.units (id, branch_id, unit_type_code, code)
    values ((e ->> 'id')::uuid, v_branch, e ->> 'unit_type_code', v_code);
  end loop;

  select coalesce(array_agg((x ->> 'unit_id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(p_placements) x;

  if cardinality(v_ids) <> (select count(distinct u) from unnest(v_ids) u) then
    raise exception 'มีห้องซ้ำกันในผัง';
  end if;

  -- ห้องวางทับกันไม่ได้ (สัญลักษณ์วางทับได้)
  if exists (
    select 1
    from jsonb_array_elements(p_placements) a
    cross join jsonb_array_elements(p_placements) b
    where (a ->> 'unit_id') < (b ->> 'unit_id')
      and (a ->> 'x')::int < (b ->> 'x')::int + (b ->> 'w')::int
      and (b ->> 'x')::int < (a ->> 'x')::int + (a ->> 'w')::int
      and (a ->> 'y')::int < (b ->> 'y')::int + (b ->> 'h')::int
      and (b ->> 'y')::int < (a ->> 'y')::int + (a ->> 'h')::int
  ) then
    raise exception 'มีห้องวางทับกันอยู่ กรุณาจัดให้ไม่ซ้อนกันก่อนบันทึก';
  end if;

  update public.floor_plans
  set name = trim(p_name), cols = p_cols, rows = p_rows
  where id = p_plan_id;

  delete from public.unit_placements
  where floor_plan_id = p_plan_id and not (unit_id = any (v_ids));

  insert into public.unit_placements (unit_id, floor_plan_id, x, y, w, h, shape)
  select (x ->> 'unit_id')::uuid, p_plan_id, (x ->> 'x')::int, (x ->> 'y')::int, (x ->> 'w')::int, (x ->> 'h')::int,
         coalesce(x ->> 'shape', 'rect')
  from jsonb_array_elements(p_placements) x
  on conflict (unit_id) do update
    set floor_plan_id = excluded.floor_plan_id,
        x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h, shape = excluded.shape;

  -- สัญลักษณ์: แทนที่ทั้งหมดของผังนี้
  delete from public.plan_objects where floor_plan_id = p_plan_id;
  insert into public.plan_objects (id, floor_plan_id, label, shape, color, x, y, w, h)
  select (o ->> 'id')::uuid, p_plan_id, coalesce(trim(o ->> 'label'), ''), coalesce(o ->> 'shape', 'rect'),
         coalesce(o ->> 'color', 'gray'), (o ->> 'x')::int, (o ->> 'y')::int, (o ->> 'w')::int, (o ->> 'h')::int
  from jsonb_array_elements(p_objects) o;
  if exists (
    select 1 from public.plan_objects
    where floor_plan_id = p_plan_id and (x + w > p_cols or y + h > p_rows)
  ) then
    raise exception 'มีสัญลักษณ์เกินขอบผัง';
  end if;
end;
$$;

revoke execute on function public.save_floor_plan_v2(uuid, text, int, int, jsonb, jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.save_floor_plan_v2(uuid, text, int, int, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ผังเรียลไทม์อัปเดตเมื่อสัญลักษณ์เปลี่ยน
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plan_objects'
  ) then
    alter publication supabase_realtime add table public.plan_objects;
  end if;
end;
$$;

notify pgrst, 'reload schema';
