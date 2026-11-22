#!/usr/bin/env python3
"""เทสต์คลังและตัว build · รัน: python3 tests/test_bank.py  (ต้อง ALL PASS ก่อน commit)"""
import os, re, sys, json, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
def ok(cond, name):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

r = subprocess.run([sys.executable, os.path.join(ROOT, 'bank', 'build.py')], capture_output=True, text=True)
ok(r.returncode == 0, 'build.py ผ่าน (ตัวตรวจ 0 error)')
items = json.load(open(os.path.join(ROOT, 'build', 'items.json'), encoding='utf-8'))
ok(len(items) >= 42, 'มีข้ออย่างน้อย 42 ข้อ')
ok(all(it['status'] == 'draft' or it['status'] == 'approved' for it in items), 'สถานะถูกต้อง')
mcq = [it for it in items if it['kind'] == 'mcq']
ok(all(0 <= it['answer'] < 4 and len(it['choices']) == 4 for it in mcq), 'mcq มี answer และ 4 ตัวเลือกหลังสลับ')
pos = [it['answer'] for it in mcq]
ok(max(pos.count(i) for i in range(4)) <= 0.45 * len(pos), 'ตำแหน่งข้อถูกกระจาย ไม่กองที่ตัวเลือกเดียว')
src_first = {}
import yaml
for it in yaml.safe_load(open(os.path.join(ROOT, 'bank', 'cefr', 'b1', 'w01.yaml'), encoding='utf-8')):
    if it['kind'] == 'mcq': src_first[it['id']] = it['choices'][0]['t']
ok(all(it['choices'][it['answer']]['t'] == src_first[it['id']] for it in mcq if it['id'] in src_first), 'answer ชี้ตัวเลือกที่ถูกหลังสลับ')
course = json.load(open(os.path.join(ROOT, 'build', 'course_cefr_b1.json'), encoding='utf-8'))
ok(course['weeks'][0]['week'] == 1 and len(course['weeks'][0]['sessions']) == 6, 'สัปดาห์ 1 มี 6 วัน')
# dist/ ต้องไม่มีเฉลยหรือเหตุผล (เมื่อมี dist แล้ว)
leak = []
for d, _, fs in os.walk(os.path.join(ROOT, 'dist')):
    if os.sep + os.path.join('dist', 'p') in d + os.sep or d.endswith(os.path.join('dist', 'p')): continue   # หน้าโพสต์เพจเป็นของสาธารณะ ตรวจแยกด้านล่าง
    for f in fs:
        if f.endswith(('.json', '.js', '.html')):
            s = open(os.path.join(d, f), encoding='utf-8', errors='ignore').read()
            if f == 'dict.json':                  # พจนานุกรมกดค้าง: มีคำว่า "choices" เป็นคำศัพท์ได้ จึงตรวจโครงสร้างแทน (คำ → [ชนิดคำ, ไทย, ตัวอย่าง] เท่านั้น)
                d_ = json.loads(s)
                if set(d_) != {'v', 'w'} or not all(isinstance(v, list) and len(v) == 3 and all(isinstance(x, str) for x in v) for v in d_['w'].values()) \
                        or re.search(r'cefr-[a-z0-9]+-(w\d{2}|cp[abc]|pl)-\d{3}', s): leak.append(f)
                continue
            if re.search(r'cefr-[a-z0-9]+-(w\d{2}|cp[abc]|pl)-\d{3}', s) or 'DEMO_DATA=' in s or f == 'demo_data.js' or '"choices"' in s: leak.append(f)
ok(not leak, f'dist/ ไม่มีเฉลยหรือเหตุผลรั่ว {leak}')
# หน้าโพสต์ใน dist/p/: เฉพาะโพสต์ที่อนุมัติแล้ว และไม่มีข้อจากคลังที่ขาย
bad = []
for d, _, fs in os.walk(os.path.join(ROOT, 'dist', 'p')):
    for f in fs:
        if not f.endswith('.html'): continue
        s = open(os.path.join(d, f), encoding='utf-8').read()
        m = re.search(r'<script type="application/json" id="post-data">(.*?)</script>', s, re.S)
        pid = json.loads(m.group(1).replace('<\\/', '</'))['id'] if m else '?'
        if re.search(r'cefr-[a-z0-9]+-(w\d{2}|cp[abc]|pl)-\d{3}', s): bad.append(pid + ' มีรหัสข้อจากคลังที่ขาย')
        src = os.path.join(ROOT, 'build', 'posts.json')
        st = {p['id']: p['status'] for p in json.load(open(src, encoding='utf-8'))['posts']} if os.path.exists(src) else {}
        if st.get(pid) != 'approved': bad.append(pid + ' ยังไม่อนุมัติแต่อยู่ในเว็บจริง')
ok(not bad, f'dist/p/ มีเฉพาะโพสต์ที่อนุมัติแล้ว {bad}')
print('ALL PASS' if not fails else f'{len(fails)} FAILED')
sys.exit(1 if fails else 0)
