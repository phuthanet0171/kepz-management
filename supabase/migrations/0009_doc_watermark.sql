-- =====================================================================
-- Kepz — ลายน้ำรูปภาพบนเอกสาร (สัญญาเช่า ใบวางบิล ใบเสร็จ)
-- วิธีใช้: รันใน Supabase > SQL Editor (รันครั้งเดียว)
--
-- เก็บรูปเป็น data URL ในตารางแยก 1 แถว (ไม่ใส่ใน settings เพราะ settings ถูกโหลดเกือบทุกหน้า)
-- อ่านได้ทุกคนที่ใช้งานระบบ (ต้องใช้ตอนพิมพ์เอกสาร) แก้ได้เฉพาะ Owner
-- =====================================================================

create table if not exists public.doc_watermark (
  id         int primary key default 1 check (id = 1),
  image      text,
  enabled    boolean  not null default true,
  opacity    smallint not null default 8  check (opacity between 2 and 30),   -- ความเข้ม %
  size       smallint not null default 60 check (size between 20 and 90),     -- ความกว้าง % ของหน้ากระดาษ
  updated_at timestamptz not null default now(),
  constraint doc_watermark_image_check check (
    image is null
    or (length(image) <= 2500000 and image ~ '^data:image/(png|jpeg|webp|svg\+xml);base64,')
  )
);

insert into public.doc_watermark (id) values (1) on conflict (id) do nothing;

alter table public.doc_watermark enable row level security;

drop policy if exists doc_watermark_select on public.doc_watermark;
drop policy if exists doc_watermark_update on public.doc_watermark;
create policy doc_watermark_select on public.doc_watermark for select to authenticated using (public.is_member());
create policy doc_watermark_update on public.doc_watermark for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

revoke all on public.doc_watermark from anon, public;
grant select, update on public.doc_watermark to authenticated;

notify pgrst, 'reload schema';
