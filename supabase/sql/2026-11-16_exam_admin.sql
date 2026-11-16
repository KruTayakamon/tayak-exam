-- CEFR for Kru · ตารางของ owner panel (ร่าง 16 พ.ย. 2569) · **ยังไม่ได้รัน รอบอสอนุมัติ** · รันหลัง 2026-11-16_exam_core.sql
-- เพิ่มอย่างเดียว · ไม่มี policy = เข้าถึงได้เฉพาะ Edge Function exam-admin (service role) ซึ่งตรวจว่าเป็นเจ้าของทุกคำขอ
-- รายชื่ออีเมลเจ้าของไม่อยู่ในฐานข้อมูลและไม่อยู่ใน repo: บอสตั้งเป็น secret EXAM_OWNER_EMAILS (คั่นด้วยจุลภาค)

create table if not exists public.exam_settings (      -- ค่าที่เจ้าของแก้ได้: prices launch_until on_sale banner maintenance (ตรวจค่าด้วย pricing.validSetting)
  key text primary key,
  value jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table public.exam_settings enable row level security;

create table if not exists public.exam_admin_log (     -- บันทึกทุกการกระทำของเจ้าของที่เปลี่ยนข้อมูล (ต่อท้ายอย่างเดียว)
  id bigint generated always as identity primary key,
  actor text not null,                                 -- อีเมลของผู้กระทำ
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists exam_admin_log_time_idx on public.exam_admin_log(created_at desc);
alter table public.exam_admin_log enable row level security;

-- หา user id จากอีเมล (ให้สิทธิ์ ดูความคืบหน้า ลบข้อมูลตามคำขอ) · เรียกได้เฉพาะ service role
create or replace function public.exam_admin_user_id(p_email text) returns uuid
language sql security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public.exam_admin_user_id(text) from public, anon, authenticated;
grant execute on function public.exam_admin_user_id(text) to service_role;

-- ลบข้อมูลการเรียนของผู้ใช้หนึ่งคนตามคำขอ (คำสั่งซื้อเก็บไว้ตามหน้าที่ทางบัญชี) · เรียกได้เฉพาะ service role
create or replace function public.exam_admin_delete_user_data(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.exam_events where user_id = p_user;
  delete from public.exam_item_state where user_id = p_user;
  delete from public.exam_sessions where user_id = p_user;
  delete from public.exam_checkpoints where user_id = p_user;
  delete from public.exam_enrolments where user_id = p_user;
  delete from public.exam_self_reports where user_id = p_user;
  update public.exam_placements set user_id = null where user_id = p_user;
end $$;
revoke all on function public.exam_admin_delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.exam_admin_delete_user_data(uuid) to service_role;
