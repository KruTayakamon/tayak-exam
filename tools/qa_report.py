#!/usr/bin/env python3
"""รายงานรับงานเนื้อหาต่อสัปดาห์ (ใช้หลัง bank/check_bank.py ผ่านแล้ว)
ใช้: python3 tools/qa_report.py b1 2 [--sample 0.25]
แสดง: สัดส่วนทักษะ/ชนิด/ระดับ · สัดส่วนคำอธิบายที่มีไฮไลต์ · ตำแหน่งความยาวของข้อถูก
และรายชื่อข้อที่สุ่มให้คนตรวจ (สุ่มแบบคงที่ต่อไฟล์ รันกี่ครั้งก็ได้ชุดเดิม)
คืน exit 1 เมื่อไม่ผ่านเกณฑ์รับงานใน docs/writing/qa.md ข้อ 3"""
import sys, os, re, hashlib, collections, yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HL = re.compile(r'==.+?==|\+\+.+?\+\+|~~.+?~~')

def whys(it):
    out = []
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('why', 'explain') and isinstance(v, str): out.append(v)
                else: walk(v)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(it); return out

def main():
    if len(sys.argv) < 3: print(__doc__); return 2
    course, week = sys.argv[1], int(sys.argv[2])
    frac = float(sys.argv[sys.argv.index('--sample') + 1]) if '--sample' in sys.argv else 0.25
    path = os.path.join(ROOT, 'bank', 'cefr', course, f'w{week:02d}.yaml')
    items = yaml.safe_load(open(path, encoding='utf-8'))
    n = len(items); fails = []
    for key in ('skill', 'kind', 'level'):
        c = collections.Counter(str(it.get(key)) for it in items)
        print(f'{key:6}', ' '.join(f'{k}={v}' for k, v in sorted(c.items())))
    lv = collections.Counter(it.get('level') for it in items)
    if n >= 20 and (lv[1] > 0.6 * n or lv[3] == 0): fails.append('ระดับความยากไม่กระจาย (ระดับ 1 เกิน 60% หรือไม่มีระดับ 3)')
    hl = sum(1 for it in items if any(HL.search(w) for w in whys(it)))
    print(f'ข้อที่คำอธิบายมีไฮไลต์ {hl}/{n}')
    if hl < 0.5 * n: fails.append('ข้อที่มีไฮไลต์น้อยกว่าครึ่ง (ยังไม่ได้ปรับเป็นน้ำเสียงโน้ตของเพื่อน)')
    lens = [len(w) for it in items for w in whys(it)]
    if lens: print(f'ความยาวคำอธิบาย เฉลี่ย {sum(lens)//len(lens)} สูงสุด {max(lens)} ตัวอักษร')
    if lens and max(lens) > 220: fails.append('มีคำอธิบายยาวเกิน 220 ตัวอักษร (อ่านบนมือถือไม่ไหว)')
    topics = collections.Counter(it.get('topic') for it in items)
    print('หัวข้อ', ' '.join(f'{k}={v}' for k, v in topics.most_common()))
    st = collections.Counter(it.get('status') for it in items)
    print('สถานะ', dict(st))
    k = max(8, round(n * frac))
    ranked = sorted(items, key=lambda it: hashlib.sha1((it['id'] + '|qa').encode()).hexdigest())
    pick = sorted(it['id'] for it in ranked[:k])
    print(f'\nสุ่มตรวจ {len(pick)}/{n} ข้อ:'); print(' '.join(i.rsplit('-', 1)[1] for i in pick))
    if fails:
        print('\nไม่ผ่านเกณฑ์รับงาน:'); [print(' -', f) for f in fails]; return 1
    print('\nผ่านเกณฑ์รับงานอัตโนมัติ (ยังต้องสุ่มตรวจด้วยคน)'); return 0

if __name__ == '__main__': sys.exit(main())
