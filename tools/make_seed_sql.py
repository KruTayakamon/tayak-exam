#!/usr/bin/env python3
"""สร้างไฟล์ SQL สำหรับนำเนื้อหาเข้า Supabase (บอสรันเองใน SQL Editor ไม่ต้องใช้คีย์ใด ๆ)
รัน: python3 bank/build.py && python3 tools/make_seed_sql.py [--approved-only]  → build/seed_content.sql (ไม่ commit)
ค่าเริ่มต้นรวมทุกสถานะเพื่อทดสอบภายใน · ก่อนเปิดขายให้ใช้ --approved-only"""
import os, sys, json, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
only = '--approved-only' in sys.argv
force = '--force-status' in sys.argv      # ปกติไม่เขียนทับสถานะของข้อที่มีอยู่แล้ว เพราะบอสอนุมัติ/ถอดข้อจาก owner panel
q = lambda s: "'" + str(s).replace("'", "''") + "'"
out = ['-- สร้างอัตโนมัติ ห้ามแก้ · upsert เนื้อหา CEFR for Kru', 'begin;']
items = json.load(open(os.path.join(ROOT, 'build', 'items.json'), encoding='utf-8'))
n = 0
for it in items:
    if only and it['status'] != 'approved': continue
    parts = it['id'].split('-')                       # cefr-b1-w01-001 | cefr-b1-cpa-001 | cefr-pl-0001
    exam = parts[0]; course = parts[1] if parts[1] != 'pl' else None
    week = int(parts[2][1:]) if len(parts) > 3 and parts[2].startswith('w') else None
    role = 'placement' if parts[1] == 'pl' else 'checkpoint' if len(parts) > 3 and parts[2].startswith('cp') else 'pool' if it.get('pool') else 'session'
    form = parts[2][2] if role == 'checkpoint' else None
    points = len(it['questions']) if it['kind'] in ('cloze', 'read', 'listen') else 1
    out.append("insert into public.exam_items (id,exam,course,week,kind,skill,topic,level,role,form,points,body,status,version,updated_at) values (%s,%s,%s,%s,%s,%s,%s,%d,%s,%s,%d,%s::jsonb,%s,%d,now()) on conflict (id) do update set body=excluded.body, " + ("status=excluded.status, " if force else "") + "skill=excluded.skill, topic=excluded.topic, level=excluded.level, role=excluded.role, form=excluded.form, points=excluded.points, version=excluded.version, updated_at=now();" % (
        q(it['id']), q(exam), q(course) if course else 'null', week if week else 'null', q(it['kind']), q(it['skill']), q(it['topic']), it['level'], q(role), q(form) if form else 'null', points, q(json.dumps(it, ensure_ascii=False)), q(it['status']), it.get('version', 1)))
    n += 1
m = 0
for p in sorted(glob.glob(os.path.join(ROOT, 'build', 'course_*.json'))):
    c = json.load(open(p, encoding='utf-8')); exam, course = c['course'].split('/')
    for w in c['weeks']:
        if only and w.get('status') != 'approved': continue
        out.append("insert into public.exam_course_weeks (exam,course,week,body,status,updated_at) values (%s,%s,%d,%s::jsonb,%s,now()) on conflict (exam,course,week) do update set body=excluded.body, " + ("status=excluded.status, " if force else "") + "updated_at=now();" % (q(exam), q(course), w['week'], q(json.dumps(w, ensure_ascii=False)), q(w.get('status', 'draft'))))
        m += 1
out.append('commit;')
open(os.path.join(ROOT, 'build', 'seed_content.sql'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(f'build/seed_content.sql: {n} ข้อ · {m} สัปดาห์' + (' (เฉพาะ approved)' if only else ' (ทุกสถานะ ใช้ทดสอบภายในเท่านั้น)'))
