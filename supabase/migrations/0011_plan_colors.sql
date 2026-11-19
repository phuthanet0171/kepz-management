-- =====================================================================
-- Kepz — ผังสถานที่: สีของแต่ละห้องบนผัง + สีเพิ่มเติม + เปลี่ยนประเภทห้องจากผัง
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0010_floor_plan_shapes.sql แล้ว (รันครั้งเดียว)
-- =====================================================================

-- สีที่ใช้ได้บนผัง
alter table public.plan_objects drop constraint if exists plan_objects_color_check;
alter table public.plan_objects add constraint plan_objects_color_check check (
  color in ('yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green', 'gray', 'black', 'white', 'none')
);

-- สีของห้องบนผัง (ว่าง = ใช้สีตั้งต้นตามประเภทห้อง)
alter table public.unit_placements add column if not exists color text;
alter table public.unit_placements drop constraint if exists unit_placements_color_check;
alter table public.unit_placements add constraint unit_placements_color_check check (
  color is null or color in ('yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green', 'gray', 'black', 'white')
);

-- บันทึกผังทั้งแผ่น (แทนที่ฉบับ 0010)
-- p_placements = [{"unit_id","x","y","w","h","shape","color"}]
-- p_objects    = [{"id","label","shape","color","x","y","w","h"}]
-- p_new_units  = [{"id","code","unit_type_code"}]
-- p_renames    = [{"id","code","unit_type_code"}]   เปลี่ยนชื่อ/ประเภทห้องเดิม
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
  v_type text;
  v_unit public.units;
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

  -- เปลี่ยนชื่อ / ประเภทห้องเดิม (เฉพาะห้องของสาขานี้)
  for e in select * from jsonb_array_elements(p_renames) loop
    select * into v_unit from public.units where id = (e ->> 'id')::uuid and branch_id = v_branch;
    if v_unit.id is null then
      continue;
    end if;
    v_code := upper(trim(coalesce(e ->> 'code', v_unit.code)));
    v_type := coalesce(e ->> 'unit_type_code', v_unit.unit_type_code);
    if length(v_code) not between 1 and 20 then
      raise exception 'ชื่อห้องต้องมี 1–20 ตัวอักษร';
    end if;
    if v_type <> v_unit.unit_type_code then
      if not exists (select 1 from public.unit_types where code = v_type) then
        raise exception 'ไม่พบประเภทห้อง %', v_type;
      end if;
      if exists (select 1 from public.contracts where unit_id = v_unit.id and status = 'active') then
        raise exception 'ห้อง % มีผู้เช่าอยู่ เปลี่ยนประเภทไม่ได้', v_unit.code;
      end if;
    end if;
    update public.units set code = v_code, unit_type_code = v_type
    where id = v_unit.id and (code is distinct from v_code or unit_type_code is distinct from v_type);
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

  -- ห้องเช่าวางทับกันไม่ได้ (รูปที่ไม่ใช่ห้องเช่าวางทับได้)
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

  insert into public.unit_placements (unit_id, floor_plan_id, x, y, w, h, shape, color)
  select (x ->> 'unit_id')::uuid, p_plan_id, (x ->> 'x')::int, (x ->> 'y')::int, (x ->> 'w')::int, (x ->> 'h')::int,
         coalesce(x ->> 'shape', 'rect'), nullif(x ->> 'color', '')
  from jsonb_array_elements(p_placements) x
  on conflict (unit_id) do update
    set floor_plan_id = excluded.floor_plan_id,
        x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h,
        shape = excluded.shape, color = excluded.color;

  delete from public.plan_objects where floor_plan_id = p_plan_id;
  insert into public.plan_objects (id, floor_plan_id, label, shape, color, x, y, w, h)
  select (o ->> 'id')::uuid, p_plan_id, coalesce(trim(o ->> 'label'), ''), coalesce(o ->> 'shape', 'rect'),
         coalesce(o ->> 'color', 'gray'), (o ->> 'x')::int, (o ->> 'y')::int, (o ->> 'w')::int, (o ->> 'h')::int
  from jsonb_array_elements(p_objects) o;
  if exists (
    select 1 from public.plan_objects
    where floor_plan_id = p_plan_id and (x + w > p_cols or y + h > p_rows)
  ) then
    raise exception 'มีรูปเกินขอบผัง';
  end if;
end;
$$;

revoke execute on function public.save_floor_plan_v2(uuid, text, int, int, jsonb, jsonb, jsonb, jsonb) from anon, public;
grant execute on function public.save_floor_plan_v2(uuid, text, int, int, jsonb, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
