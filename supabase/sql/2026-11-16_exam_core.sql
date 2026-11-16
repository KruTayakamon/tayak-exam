-- CEFR for Kru · ตารางหลัก (ร่าง 16 พ.ย. 2569) · **ยังไม่ได้รัน รอบอสอนุมัติ**
-- โปรเจกต์ Supabase: tayak-kitchen (ใช้ร่วมกับเกมครัว) · ไฟล์นี้ "เพิ่มอย่างเดียว":
--   สร้างเฉพาะตารางที่ขึ้นต้น exam_ · ไม่แก้ ไม่ลบ ไม่อ้างตารางของเกมครัว (orders, entitlements, saves, profiles ...)
--   ใช้ auth.users ร่วมกัน (ผู้ใช้คนเดียวล็อกอินได้ทั้งสองผลิตภัณฑ์)
-- รันซ้ำได้ (if not exists) · ทุกตารางเปิด RLS · ตารางที่ไม่มี policy = อ่านเขียนได้เฉพาะ service role (Edge Function)
-- คำอธิบายการออกแบบ: docs/cefr/05_backend.md

-- 1) เนื้อหาที่ขาย: ไม่มี policy → เบราว์เซอร์อ่านตรงไม่ได้ ต้องผ่าน exam-api ซึ่งตรวจสิทธิ์
create table if not exists public.exam_items (
  id text primary key,                         -- เช่น cefr-b1-w01-001 (ไม่เปลี่ยนตลอดชีวิตของข้อ)
  exam text not null,                          -- cefr | kpc | adm
  course text,                                 -- a2 b1 b2 c1 c2 · null สำหรับแบบวัดระดับ
  week int,
  kind text not null,
  skill text not null,
  topic text not null,
  level int not null,
  role text not null default 'session' check (role in ('session','pool','checkpoint','placement')),
  form text,                                   -- a b c สำหรับชุดวัดผล
  points int not null default 1,
  body jsonb not null,                         -- โจทย์ ตัวเลือก (สลับแล้ว) answer เหตุผล
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists exam_items_course_idx on public.exam_items(exam, course, week, role);
alter table public.exam_items enable row level security;

create table if not exists public.exam_course_weeks (
  exam text not null, course text not null, week int not null,
  body jsonb not null,                         -- เนื้อหาไฟล์ course/.../wNN.yaml (บทเรียนย่อ ห้องฝึก รหัสข้อ)
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  updated_at timestamptz not null default now(),
  primary key (exam, course, week)
);
alter table public.exam_course_weeks enable row level security;

-- 2) คำสั่งซื้อและสิทธิ์
create table if not exists public.exam_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,                       -- cefr-b1 | cefr-all | cefr-extend ...
  target text,                                 -- สินค้าที่ถูกต่อเวลา (เฉพาะ cefr-extend)
  days int not null,
  amount int not null,                         -- บาท ที่เซิร์ฟเวอร์คำนวณ
  list_price int not null,
  launch boolean not null default false,
  provider text not null default 'beam',
  provider_link_id text,
  provider_url text,
  status text not null default 'pending' check (status in ('pending','paid','expired','failed','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  credited_at timestamptz,                     -- ตั้งครั้งเดียวเมื่อให้สิทธิ์แล้ว (กันให้ซ้ำ)
  refunded_at timestamptz
);
create index if not exists exam_orders_user_idx on public.exam_orders(user_id, created_at desc);
create index if not exists exam_orders_link_idx on public.exam_orders(provider_link_id);
alter table public.exam_orders enable row level security;
drop policy if exists "exam_orders own read" on public.exam_orders;
create policy "exam_orders own read" on public.exam_orders for select using (auth.uid() = user_id);

create table if not exists public.exam_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,                       -- cefr-<คอร์ส> หรือ cefr-all
  expires_at timestamptz not null,
  source text not null default 'order' check (source in ('order','comp','guarantee')),
  guarantee_at timestamptz,                    -- ใช้ข้อรับรองความคุ้มค่าแล้วเมื่อไร (ครั้งเดียวต่อสิทธิ์)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product)
);
alter table public.exam_entitlements enable row level security;
drop policy if exists "exam_entitlements own read" on public.exam_entitlements;
create policy "exam_entitlements own read" on public.exam_entitlements for select using (auth.uid() = user_id);

-- 3) การเรียน
create table if not exists public.exam_enrolments (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam text not null, course text not null,
  pace int not null default 20 check (pace in (10,20,40)),
  target_date date,                            -- วันที่ตั้งใจสอบ (ไม่บังคับ)
  slot text,                                   -- เวลาเรียนประจำที่ผู้เรียนเลือก เช่น "after-school"
  week int not null default 1, day int not null default 1, part text not null default 'a', done boolean not null default false,
  cp_order text,                               -- ลำดับชุดวัดผล abc | bca | cab (เซิร์ฟเวอร์กำหนดตอนเริ่ม)
  started_at timestamptz not null default now(),
  last_day int,                                -- เลขวันล่าสุดที่เรียน (ตาม engine.dayNo)
  primary key (user_id, exam, course)
);
alter table public.exam_enrolments enable row level security;
drop policy if exists "exam_enrolments own read" on public.exam_enrolments;
create policy "exam_enrolments own read" on public.exam_enrolments for select using (auth.uid() = user_id);

create table if not exists public.exam_events (     -- บันทึกคำตอบแบบต่อท้ายอย่างเดียว · eid มาจากเครื่องผู้เรียน ใช้กันซ้ำ
  eid uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam text not null, course text not null,
  item_id text not null,
  q int not null default 0,                    -- ลำดับคำถามย่อยในชุด (บทอ่าน บทฟัง)
  correct boolean not null,
  first boolean not null,                      -- ตอบครั้งแรกของข้อนี้หรือไม่ (เซิร์ฟเวอร์ตัดสินจากสถานะ ไม่เชื่อค่าจากเครื่อง)
  mode text not null check (mode in ('review','check','practice','extra','mock','checkpoint')),
  day_no int not null,
  ts timestamptz not null default now()
);
create index if not exists exam_events_user_day_idx on public.exam_events(user_id, course, day_no);
alter table public.exam_events enable row level security;

create table if not exists public.exam_item_state (  -- สถานะทบทวนตามเวลาของแต่ละข้อ (คำนวณด้วย engine.srsUpdate ที่เซิร์ฟเวอร์)
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  course text not null,
  box int not null, probe boolean not null default false, due int not null,
  seen int not null default 1, wrong int not null default 0, lapses int not null default 0,
  last int not null, mastered boolean not null default false,
  primary key (user_id, item_id)
);
create index if not exists exam_item_state_due_idx on public.exam_item_state(user_id, course, due);
alter table public.exam_item_state enable row level security;
drop policy if exists "exam_item_state own read" on public.exam_item_state;
create policy "exam_item_state own read" on public.exam_item_state for select using (auth.uid() = user_id);

create table if not exists public.exam_sessions (    -- เซสชันที่ทำจบ: ใช้นับเป้าสัปดาห์ เพดานต่อวัน ข้อรับรอง และเงื่อนไขคืนเงิน
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam text not null, course text not null,
  kind text not null check (kind in ('full','short','extra','remedial','mock')),
  week int, day int, part text,
  day_no int not null,
  minutes int,
  score jsonb,                                 -- ชุดย่อย: คะแนนรวมและรายหัวข้อ
  completed_at timestamptz not null default now()
);
create index if not exists exam_sessions_user_idx on public.exam_sessions(user_id, course, day_no);
alter table public.exam_sessions enable row level security;
drop policy if exists "exam_sessions own read" on public.exam_sessions;
create policy "exam_sessions own read" on public.exam_sessions for select using (auth.uid() = user_id);

create table if not exists public.exam_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam text not null, course text not null, n int not null check (n between 1 and 3),
  form text not null,
  item_ids text[] not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb,
  score jsonb,                                 -- {total, by_skill:{gm:{correct,n},...}}
  primary key (user_id, exam, course, n)
);
alter table public.exam_checkpoints enable row level security;
drop policy if exists "exam_checkpoints own read" on public.exam_checkpoints;
create policy "exam_checkpoints own read" on public.exam_checkpoints for select using (auth.uid() = user_id);

-- 4) แบบวัดระดับฟรี (ไม่ต้องล็อกอิน) · เก็บเท่าที่จำเป็น: คำตอบ ผล และแฮชของ IP สำหรับจำกัดอัตราเท่านั้น
create table if not exists public.exam_placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,   -- ผูกเมื่อผู้ทำล็อกอินภายหลัง
  exam text not null default 'cefr',
  answers jsonb not null,
  result jsonb not null,
  ip_hash text,                                -- sha256(ip + เกลือลับ) · ลบอัตโนมัติเมื่อครบ 30 วัน (ดูงานประจำใน 05_backend.md)
  created_at timestamptz not null default now()
);
create index if not exists exam_placements_ip_idx on public.exam_placements(ip_hash, created_at);
alter table public.exam_placements enable row level security;

-- 5) รายงานข้อผิด: ใครก็ส่งได้ อ่านได้เฉพาะ service role (แบบเดียวกับ item_reports ของเกมครัว)
create table if not exists public.exam_reports (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  why text not null check (why in ('wrong_key','wrong_explain','typo','ambiguous','too_hard','other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,                     -- เจ้าของปิดเรื่องแล้วเมื่อไร (owner panel)
  resolution text
);
alter table public.exam_reports enable row level security;
drop policy if exists "exam_reports insert" on public.exam_reports;
create policy "exam_reports insert" on public.exam_reports for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- 6) ผลสอบจริงที่ผู้เรียนแจ้งเองแบบสมัครใจ (ใช้ปรับเกณฑ์ความพร้อม · 03_learning_engine.md ข้อ 5.4)
create table if not exists public.exam_self_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam text not null, course text not null,
  level_obtained text not null,                -- A2 B1 B2 C1 C2 หรือ "ไม่ถึง A2"
  taken_on date,
  readiness jsonb,                             -- ความพร้อมรายทักษะ ณ วันที่แจ้ง (เซิร์ฟเวอร์เติม)
  created_at timestamptz not null default now(),
  primary key (user_id, exam, course, created_at)
);
alter table public.exam_self_reports enable row level security;
drop policy if exists "exam_self_reports own read" on public.exam_self_reports;
create policy "exam_self_reports own read" on public.exam_self_reports for select using (auth.uid() = user_id);

-- 7) ลบข้อมูลการเรียนของตัวเอง (ปุ่ม "ลบข้อมูลของฉัน" ในหน้าบัญชี) · คำสั่งซื้อเก็บไว้ตามหน้าที่ทางบัญชี
create or replace function public.exam_delete_my_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.exam_events where user_id = auth.uid();
  delete from public.exam_item_state where user_id = auth.uid();
  delete from public.exam_sessions where user_id = auth.uid();
  delete from public.exam_checkpoints where user_id = auth.uid();
  delete from public.exam_enrolments where user_id = auth.uid();
  delete from public.exam_self_reports where user_id = auth.uid();
  update public.exam_placements set user_id = null where user_id = auth.uid();
end $$;
revoke all on function public.exam_delete_my_data() from public, anon;
grant execute on function public.exam_delete_my_data() to authenticated;

comment on table public.exam_items is 'CEFR for Kru / tayak-exam: paid item bank; service role only';
comment on table public.exam_orders is 'tayak-exam orders (Beam payment links); writes only via service role';
