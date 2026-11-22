#!/usr/bin/env python3
"""พจนานุกรมสำหรับ "กดค้างที่คำเพื่อดูคำแปลและชนิดคำ" (บอสขอ 22 พ.ย. 2569)

แหล่ง (ลำดับความสำคัญของคำแปล):
  1. คำศัพท์ในบทเรียนของคอร์สที่อนุมัติแล้ว  course/cefr/<คอร์ส>/w*.yaml (status approved เท่านั้น)
  2. คลังศัพท์ของเกมครัว                   dict/src/kitchen_vocab.txt  (คำ | ชนิดคำ | ไทย | ตัวอย่าง | ...)
  3. พจนานุกรมสั้นของเกมครัว               dict/src/kitchen_dict_th.txt (คำ | ไทย)
  4. คำแปลตัวลวงของเกมครัว                 dict/src/kitchen_gloss_th.txt (ข้ามบรรทัด ! และ @)
  ชนิดคำของแหล่ง 3–4 มาจาก dict/pos_extra.txt
ไฟล์ใน dict/src/ คัดลอกจาก repo เกมครัว (TAYAK เขียนเอง) เมื่อ 22 พ.ย. 2569 · แก้ที่นี่ได้เลย ไม่ต้องตามต้นทาง

ผลลัพธ์: dict.json {"v":1,"w":{คำ: [ชนิดคำ, ไทย, ตัวอย่างหรือ ""]}} · build.py ใส่ใน dist/data/dict.json
ใช้: python3 tools/make_dict.py [--check]   (--check พิมพ์สถิติและคำที่ยังไม่มีชนิดคำ)
"""
import glob, json, os, re, sys
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'dict')
POS_NORM = {'noun': 'n', 'n': 'n', 'verb': 'v', 'v': 'v', 'adjective': 'adj', 'adj': 'adj', 'adverb': 'adv', 'adv': 'adv',
            'preposition': 'prep', 'prep': 'prep', 'conjunction': 'conj', 'conj': 'conj', 'pronoun': 'pron', 'pron': 'pron',
            'determiner': 'det', 'det': 'det', 'phrasal verb': 'phrv', 'phr v': 'phrv', 'phrv': 'phrv', 'modal': 'modal',
            'aux': 'aux', 'int': 'int', 'interjection': 'int', 'num': 'num', 'name': 'name', 'phr': 'phr', 'abbr': 'abbr',
            'n pl': 'n', 'idiom': 'phr', 'phrase': 'phr'}
ORDER = ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'modal', 'aux', 'phrv', 'int', 'num', 'name', 'phr', 'abbr']


def norm_pos(raw):
    out = []
    for p in re.split(r'[/,]', str(raw or '')):
        k = POS_NORM.get(p.strip().rstrip('.').replace('.', ' ').strip().lower())
        if k and k not in out: out.append(k)
    return out


def rows(fn):
    for ln in open(os.path.join(D, 'src', fn), encoding='utf-8'):
        if ln.startswith(('#', '@')) or '|' not in ln: continue
        yield [x.strip() for x in ln.rstrip('\n').split('|')]


def extra_pos():
    m = {}
    for ln in open(os.path.join(D, 'pos_extra.txt'), encoding='utf-8'):
        if ln.startswith('#') or ':' not in ln: continue
        tag, rest = ln.split(':', 1); tag = tag.strip()
        words = [w.strip() for w in rest.split(';')] if tag in ('phr', 'phrv') else rest.split()
        for w in words:
            if w: m.setdefault(w.lower(), [])
            if w and tag not in m[w.lower()]: m[w.lower()].append(tag)
    return m


def build():
    entries = {}                                   # คำ -> {'pos': [], 'th': '', 'ex': ''}

    def add(w, pos, th, ex='', override=False):
        k = str(w).strip().lower()
        if not k or not th: return
        e = entries.setdefault(k, {'pos': [], 'th': '', 'ex': ''})
        for p in pos:
            if p not in e['pos']: e['pos'].append(p)
        if override or not e['th']: e['th'] = th
        if ex and not e['ex']: e['ex'] = ex

    for f in sorted(glob.glob(os.path.join(ROOT, 'course', 'cefr', '*', 'w*.yaml'))):
        w = yaml.safe_load(open(f, encoding='utf-8'))
        if w.get('status') != 'approved': continue
        for s in w.get('sessions', []):
            for x in ((s.get('lesson') or {}).get('words') or []):
                add(x['w'], norm_pos(x.get('pos')), x.get('th', ''), x.get('ex', ''))
    for r in rows('kitchen_vocab.txt'):
        if len(r) >= 3: add(r[0], norm_pos(r[1]), r[2], r[3] if len(r) > 3 and r[3] != '-' else '')
    ext = extra_pos()
    for fn in ('kitchen_dict_th.txt', 'kitchen_gloss_th.txt'):
        for r in rows(fn):
            if len(r) < 2 or r[0].startswith('!') or r[1].startswith('@'): continue
            add(r[0], ext.get(r[0].lower(), []), r[1])
    for k, e in entries.items():                   # คำที่มีชนิดคำใน pos_extra เพิ่มเติม (เช่น report = n และ v)
        for p in ext.get(k, []):
            if p not in e['pos']: e['pos'].append(p)
        e['pos'].sort(key=lambda p: ORDER.index(p) if p in ORDER else 99)
    return entries


def main():
    e = build()
    out = {'v': 1, 'w': {k: ['/'.join(v['pos']), v['th'], v['ex']] for k, v in sorted(e.items())}}
    if '--check' in sys.argv:
        miss = [k for k, v in e.items() if not v['pos'] and not re.search(r'รูปผิด|ไม่มีคำนี้', v['th'])]
        print(f'{len(e)} คำ · ไม่มีชนิดคำ {len(miss)}: {" ".join(sorted(miss))}')
    return out


if __name__ == '__main__':
    d = main()
    p = os.path.join(ROOT, 'build', 'dict.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    print(f'build/dict.json {len(d["w"])} คำ {os.path.getsize(p)//1024} KB')
