#!/usr/bin/env python3
"""ตรวจว่าสำเนาใน supabase/functions/_shared ตรงกับ engine/ และไฟล์ seed สร้างได้ · รัน: python3 tests/test_shared.py"""
import os, sys, json, subprocess, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
def ok(c, name):
    print(('PASS ' if c else 'FAIL ') + name)
    if not c: fails.append(name)
for f in ('engine.mjs', 'assemble.mjs', 'pricing.mjs', 'grade.mjs'):
    a = open(os.path.join(ROOT, 'engine', f), encoding='utf-8').read()
    p = os.path.join(ROOT, 'supabase', 'functions', '_shared', f)
    ok(os.path.exists(p) and open(p, encoding='utf-8').read() == a, f'_shared/{f} ตรงกับ engine/ (ถ้าไม่ตรงรัน tools/sync_shared.py)')
cfg = json.load(open(os.path.join(ROOT, 'engine', 'config.json'), encoding='utf-8'))
s = open(os.path.join(ROOT, 'supabase', 'functions', '_shared', 'config.mjs'), encoding='utf-8').read()
ok(json.loads(s[s.index('export default') + 14:].rstrip().rstrip(';')) == cfg, '_shared/config.mjs ตรงกับ engine/config.json')
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'make_seed_sql.py')], capture_output=True, text=True)
sql = open(os.path.join(ROOT, 'build', 'seed_content.sql'), encoding='utf-8').read() if r.returncode == 0 else ''
ok(r.returncode == 0 and sql.count('insert into public.exam_items') >= 42 and 'exam_course_weeks' in sql, 'สร้างไฟล์ seed ได้')
import glob
core = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ROOT, 'supabase', 'sql', '*.sql'))))
tables = re.findall(r'create table if not exists public\.(\w+)', core)
ok(tables and all(t.startswith('exam_') for t in tables), 'ทุกตารางขึ้นต้น exam_')
ok(all(f'alter table public.{t} enable row level security' in core for t in tables), 'ทุกตารางเปิด RLS')
ok(not re.search(r'\b(drop table|alter table public\.(?!exam_)|delete from public\.(?!exam_)|update public\.(?!exam_))', core), 'ไฟล์ SQL ไม่แตะตารางของเกมครัว')
src = ''.join(open(os.path.join(d, f), encoding='utf-8').read() for d, _, fs in os.walk(os.path.join(ROOT, 'supabase', 'functions')) for f in fs if f.endswith('.ts'))
used = set(re.findall(r'\.from\("(\w+)"\)', src))
ok(used and used <= set(tables), f'Edge Functions ใช้เฉพาะตารางที่ประกาศในไฟล์ SQL {sorted(used - set(tables))}')
rpcs = set(re.findall(r'\.rpc\("(\w+)"', src)); fns = set(re.findall(r'create or replace function public\.(\w+)', core))
ok(rpcs <= fns and all(f.startswith('exam_') for f in fns), f'ฟังก์ชัน SQL ที่โค้ดเรียกมีประกาศครบและขึ้นต้น exam_ {sorted(rpcs - fns)}')
adm = open(os.path.join(ROOT, 'supabase', 'functions', 'exam-admin', 'index.ts'), encoding='utf-8').read()
ok(adm.index('isOwner(user') < adm.index('await req.json()'), 'exam-admin ตรวจความเป็นเจ้าของก่อนอ่านคำขอ')
ok(not re.search(r'[\w.+-]+@(gmail|hotmail|yahoo|outlook)\.', src + core), 'ไม่มีอีเมลจริงฝังในโค้ดหรือ SQL')
ok(not re.search(r'(sk_live|eyJhbGciOi|BEAM_API_KEY\s*=\s*["\'])', src), 'ไม่มีความลับฝังในโค้ด')
print('ALL PASS' if not fails else f'{len(fails)} FAILED'); sys.exit(1 if fails else 0)
