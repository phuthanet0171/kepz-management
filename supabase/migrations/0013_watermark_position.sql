-- =====================================================================
-- Kepz — ตำแหน่งลายน้ำบนเอกสาร (เลื่อนได้เองในหน้าตั้งค่า)
-- วิธีใช้: รันใน Supabase > SQL Editor หลังจากรัน 0009_doc_watermark.sql แล้ว (รันครั้งเดียว)
-- pos_x / pos_y = ตำแหน่งจุดกึ่งกลางของรูป เป็น % ของความกว้าง/ความสูงหน้ากระดาษ (50, 50 = กลางหน้า)
-- =====================================================================

alter table public.doc_watermark add column if not exists pos_x smallint not null default 50;
alter table public.doc_watermark add column if not exists pos_y smallint not null default 50;
alter table public.doc_watermark drop constraint if exists doc_watermark_pos_check;
alter table public.doc_watermark add constraint doc_watermark_pos_check
  check (pos_x between 0 and 100 and pos_y between 0 and 100);

notify pgrst, 'reload schema';
