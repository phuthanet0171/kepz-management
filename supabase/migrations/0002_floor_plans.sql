-- =====================================================================
-- Kepz — ผังสถานที่ (Floor plans) และการอัปเดตแบบเรียลไทม์
-- วิธีใช้: รันไฟล์นี้ใน Supabase > SQL Editor หลังจากรัน 0001_init.sql แล้ว (รันครั้งเดียว)
-- หน่วยของตำแหน่งและขนาดคือ "ช่องตาราง" (grid cell) ไม่ใช่ pixel
-- =====================================================================

-- ผังแต่ละชั้น / โซนของสาขา
create table public.floor_plans (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 50),
  cols       int  not null default 48 check (cols between 10 and 300),
  rows       int  not null default 32 check (rows between 10 and 300),
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index floor_plans_branch_name_key on public.floor_plans (branch_id, lower(trim(name)));
create index floor_plans_branch_idx on public.floor_plans (branch_id, sort_order);

create trigger floor_plans_updated_at before update on public.floor_plans
  for each row execute function public.set_updated_at();

-- ตำแหน่งของห้องบนผัง (หนึ่งห้องอยู่ได้ผังเดียว)
create table public.unit_placements (
  unit_id       uuid primary key references public.units (id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans (id) on delete cascade,
  x             int not null check (x >= 0),
  y             int not null check (y >= 0),
  w             int not null check (w between 1 and 100),
  h             int not null check (h between 1 and 100),
  updated_at    timestamptz not null default now()
);
create index unit_placements_plan_idx on public.unit_placements (floor_plan_id);

-- ห้องต้องอยู่ในผังของสาขาเดียวกันเท่านั้น และต้องอยู่ภายในขอบผัง
create or replace function public.check_unit_placement()
returns trigger
language plpgsql
as $$
declare
  v_plan public.floor_plans;
  v_unit_branch uuid;
begin
  select * into v_plan from public.floor_plans where id = new.floor_plan_id;
  select branch_id into v_unit_branch from public.units where id = new.unit_id;
  if v_plan.branch_id <> v_unit_branch then
    raise exception 'ห้องนี้ไม่ได้อยู่ในสาขาของผังนี้';
  end if;
  if new.x + new.w > v_plan.cols or new.y + new.h > v_plan.rows then
    raise exception 'ตำแหน่งห้องเกินขอบผัง';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger unit_placements_check before insert or update on public.unit_placements
  for each row execute function public.check_unit_placement();

-- บันทึกผังทั้งแผ่นในครั้งเดียว
-- p_placements = [{"unit_id":"...","x":0,"y":0,"w":2,"h":2}, ...]
-- ห้องที่เคยอยู่ในผังนี้แต่ไม่มีในรายการ จะถูกนำออกจากผัง
create or replace function public.save_floor_plan(
  p_plan_id uuid,
  p_name text,
  p_cols int,
  p_rows int,
  p_placements jsonb
)
returns void
language plpgsql
as $$
declare
  v_ids uuid[];
begin
  perform public.assert_owner();

  perform 1 from public.floor_plans where id = p_plan_id for update;
  if not found then
    raise exception 'ไม่พบผัง';
  end if;

  if jsonb_typeof(p_placements) <> 'array' then
    raise exception 'ข้อมูลผังไม่ถูกต้อง';
  end if;

  select coalesce(array_agg((e ->> 'unit_id')::uuid), '{}')
    into v_ids
  from jsonb_array_elements(p_placements) e;

  if cardinality(v_ids) <> (select count(distinct u) from unnest(v_ids) u) then
    raise exception 'มีห้องซ้ำกันในผัง';
  end if;

  -- ตรวจกล่องทับกัน
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

  insert into public.unit_placements (unit_id, floor_plan_id, x, y, w, h)
  select (e ->> 'unit_id')::uuid, p_plan_id, (e ->> 'x')::int, (e ->> 'y')::int, (e ->> 'w')::int, (e ->> 'h')::int
  from jsonb_array_elements(p_placements) e
  on conflict (unit_id) do update
    set floor_plan_id = excluded.floor_plan_id,
        x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h;
end;
$$;

-- RLS
alter table public.floor_plans     enable row level security;
alter table public.unit_placements enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['floor_plans', 'unit_placements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_owner())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_owner())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_owner()) with check (public.is_owner())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', t || '_delete', t);
  end loop;
end;
$$;

create trigger floor_plans_audit after insert or update or delete on public.floor_plans
  for each row execute function public.audit_trigger();

revoke all on public.floor_plans, public.unit_placements from anon;
revoke execute on function public.save_floor_plan(uuid, text, int, int, jsonb) from anon, public;
revoke execute on function public.check_unit_placement() from anon, public;
grant execute on function public.save_floor_plan(uuid, text, int, int, jsonb) to authenticated;

-- เปิด Realtime: เมื่อข้อมูลเหล่านี้เปลี่ยน หน้าจอผังของทุกเครื่องจะอัปเดตทันที
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['units', 'contracts', 'invoices', 'payments', 'floor_plans', 'unit_placements'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
