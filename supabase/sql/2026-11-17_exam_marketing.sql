-- CEFR for Kru · ตัวนับรายโพสต์และที่มาของผู้ใช้ (ร่าง 17 พ.ย. 2569 · ยังไม่รัน · ต้องให้บอสอนุมัติก่อน)
-- รันหลัง 2026-11-16_exam_core.sql · ทุกชื่อขึ้นต้น exam_ · ไม่แตะตารางของเกมครัว
-- หลักข้อมูล: คนที่ยังไม่สมัคร เก็บเฉพาะตัวนับรวมต่อโพสต์ต่อวัน ไม่มีรหัสบุคคล ไม่มี IP ไม่มีคุกกี้ติดตาม

create table if not exists public.exam_post_stats (
  post_id text not null,                        -- mk-quiz-0001 ...
  day date not null,                            -- วันตามเวลาไทย
  step text not null check (step in ('open','answer','set_done','placement_start','placement_done','signup','purchase')),
  n int not null default 0,
  primary key (post_id, day, step)
);
alter table public.exam_post_stats enable row level security;   -- ไม่มี policy: อ่านเขียนได้เฉพาะ service role ผ่าน Edge Function

-- เพิ่มทีละ 1 แบบอะตอมมิก · เรียกจาก Edge Function เท่านั้น (ซึ่งจำกัดอัตราต่อ IP ในหน่วยความจำ ไม่บันทึก IP)
create or replace function public.exam_post_hit(p_post text, p_step text)
returns void language sql security definer set search_path = public as $$
  insert into public.exam_post_stats(post_id, day, step, n)
  values (left(p_post, 40), (now() at time zone 'Asia/Bangkok')::date, p_step, 1)
  on conflict (post_id, day, step) do update set n = public.exam_post_stats.n + 1;
$$;
revoke all on function public.exam_post_hit(text, text) from public, anon, authenticated;

-- ที่มาแรกของผู้ใช้ที่สมัครแล้ว (โพสต์แรกที่พาเข้ามา) · ใช้ตอบว่า "โพสต์ไหนทำเงิน"
alter table public.exam_enrolments add column if not exists src_post text;
alter table public.exam_orders add column if not exists src_post text;
create index if not exists exam_orders_src_idx on public.exam_orders(src_post) where src_post is not null;
