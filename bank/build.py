#!/usr/bin/env python3
"""สร้างไฟล์ผลลัพธ์จากคลังและคอร์ส · รัน: python3 bank/build.py
- build/items.json      ข้อครบทุกฟิลด์ (สำหรับอัปโหลดเข้า Supabase exam_items · ห้ามใส่ใน dist/)
- build/course_<id>.json ผังคอร์สพร้อมบทเรียน (ของเสียเงิน · ห้ามใส่ใน dist/)
ลำดับตัวเลือกสลับแบบคงที่ต่อข้อ (seed จาก id) และเก็บตำแหน่งข้อถูกไว้ใน `answer`"""
import os, sys, json, glob, hashlib, random
import yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'bank'))
import check_bank

def shuffled(iid, choices):
    order = list(range(len(choices)))
    random.Random(int(hashlib.sha256(iid.encode()).hexdigest(), 16)).shuffle(order)
    return {'choices': [{'t': choices[i]['t'], 'why': choices[i]['why']} for i in order], 'answer': order.index(0)}

def build_item(it):
    out = dict(it)
    if it['kind'] == 'mcq':
        out.update(shuffled(it['id'], it['choices']))
    elif it['kind'] in ('cloze', 'read', 'listen'):
        qs = []
        for j, q in enumerate(it['questions']):
            q2 = dict(q); q2.update(shuffled(f"{it['id']}:{j}", q['choices'])); qs.append(q2)
        out['questions'] = qs
    return out

def main():
    if check_bank.main() != 0:
        print('หยุด: ตัวตรวจไม่ผ่าน'); return 1
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    items = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'bank', '*', '**', '*.yaml'), recursive=True)):
        if os.path.basename(path).startswith('_'): continue
        for it in yaml.safe_load(open(path, encoding='utf-8')) or []:
            items.append(build_item(it))
    json.dump(items, open(os.path.join(ROOT, 'build', 'items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    courses = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'course', '*', '*', 'w*.yaml'))):
        w = yaml.safe_load(open(path, encoding='utf-8'))
        courses.setdefault(w['course'], []).append(w)
    for cid, weeks in courses.items():
        weeks.sort(key=lambda w: w['week'])
        json.dump({'course': cid, 'weeks': weeks}, open(os.path.join(ROOT, 'build', f"course_{cid.replace('/', '_')}.json"), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'build/items.json {len(items)} ข้อ · คอร์ส {list(courses)}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
