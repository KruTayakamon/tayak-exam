#!/usr/bin/env python3
"""สร้างไฟล์นำเข้าเนื้อหาสำหรับ Edge Function exam-import (มติบอส 17 พ.ย. 2569 รอบ 24)
รัน: python3 bank/build.py && python3 tools/make_import.py b1 3 [4 ...] [--status approved|draft]
  → build/import_<คอร์ส>_wNN.json (มีเฉลย ห้ามใส่ใน dist) + เพิ่ม sha256 ลง web/import/manifest.json (build.py คัดลอกไป dist/import/) (มีแต่แฮช เผยแพร่ได้)
แล้ว commit + push ขึ้น main รอ Pages อัปเดต แล้วส่ง:
  curl -s -X POST "$FN/exam-import" -H "apikey: <publishable>" --data-binary @build/import_b1_w03.json"""
import os, sys, json, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
status = 'approved' if '--status' not in sys.argv else sys.argv[sys.argv.index('--status') + 1]
course, weeks = args[0], [int(x) for x in args[1:] if x.isdigit()]
items = json.load(open(os.path.join(ROOT, 'build', 'items.json'), encoding='utf-8'))
cw = json.load(open(os.path.join(ROOT, 'build', f'course_cefr_{course}.json'), encoding='utf-8'))['weeks']
mp = os.path.join(ROOT, 'web', 'import', 'manifest.json')   # build.py คัดลอกไป dist/import/
os.makedirs(os.path.dirname(mp), exist_ok=True)
man = json.load(open(mp)) if os.path.exists(mp) else {'sha256': []}
for w in weeks:
    pre = f'cefr-{course}-w{w:02d}-'
    rows = []
    for it in items:
        if not it['id'].startswith(pre): continue
        body = {**it, 'status': status}
        rows.append({'id': it['id'], 'exam': 'cefr', 'course': course, 'week': w, 'kind': it['kind'], 'skill': it['skill'], 'topic': it['topic'], 'level': it['level'],
                     'role': 'pool' if it.get('pool') else 'session', 'form': None, 'points': len(it['questions']) if it['kind'] in ('cloze', 'read', 'listen') else 1,
                     'body': body, 'status': status, 'version': it.get('version', 1)})
    wk = [x for x in cw if x['week'] == w]
    if not rows or not wk: sys.exit(f'ไม่มีเนื้อหาสัปดาห์ {w}')
    data = {'items': rows, 'weeks': [{'exam': 'cefr', 'course': course, 'week': w, 'body': {**wk[0], 'status': status}, 'status': status}]}
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    out = os.path.join(ROOT, 'build', f'import_{course}_w{w:02d}.json'); open(out, 'wb').write(raw)
    h = hashlib.sha256(raw).hexdigest()
    if h not in man['sha256']: man['sha256'].append(h)
    print(f'{os.path.relpath(out, ROOT)} {len(rows)} ข้อ · {status} · {h[:12]}')
man['sha256'] = man['sha256'][-60:]
json.dump(man, open(mp, 'w'), indent=0)
