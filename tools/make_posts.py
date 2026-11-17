#!/usr/bin/env python3
"""เครื่องมือโพสต์เพจ CEFR for Kru (สเปก docs/cefr/08_marketing.md ข้อ 3) · รันจากรากของ repo

  python3 tools/make_posts.py [ไฟล์ ...]     ตรวจ + สร้างทุกอย่าง (ไม่ระบุไฟล์ = marketing/posts/*.yaml ที่ไม่ขึ้นต้นด้วย _)
  python3 tools/make_posts.py --check [ไฟล์]  ตรวจอย่างเดียว

ผลลัพธ์
  build/posts.json                       ข้อมูลโพสต์ที่สลับตัวเลือกแล้ว (ใช้โดย render_posts.js และ build.py)
  marketing/out/<รหัส>.txt                แคปชันพร้อมคัดลอก + ข้อความคอมเมนต์แรก
  marketing/out/<รหัส>.png                ภาพ 1080×1350 (ต้องรัน node tools/render_posts.js ต่อ · เรียกให้อัตโนมัติถ้ามี node)
  review/out/posts.html                  หน้าตรวจสำหรับบอส (ภาพ แคปชัน เฉลย) publish เป็น artifact ส่วนตัว
  หน้าเว็บของโพสต์ /p/<รหัส>/ สร้างโดย python3 build.py จาก build/posts.json:
    dist/      เฉพาะโพสต์ status: approved (เว็บจริง)   ·   dist-demo/  ทุกโพสต์ (ดูตัวอย่างในเครื่อง)

ลิงก์: marketing/config.yaml base_url (บอสตั้งเมื่อมีโดเมน) · ยังไม่ตั้ง = ใส่ https://<โดเมน> และเตือน"""
import os, sys, re, json, glob, hashlib, random, html, subprocess, shutil
import yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'bank'))
import check_bank as CB

TYPES = {'quiz', 'word', 'trap', 'class', 'tip', 'recap'}
ID_RE = re.compile(r'^mk-(quiz|word|trap|class|tip|recap)-\d{4}$')
COURSES = {'a2', 'b1', 'b2', 'c1', 'c2'}
HEAD_MAX, EN_MAX, NOTE_MAX = 40, 110, 110      # ความยาวข้อความในภาพที่ยังอ่านได้บนมือถือ (ตัวอักษร)

def cfg():
    p = os.path.join(ROOT, 'marketing', 'config.yaml')
    c = yaml.safe_load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    return {'base_url': (c.get('base_url') or '').rstrip('/'), 'hashtags': c.get('hashtags') or [], 'placement_path': c.get('placement_path') or '/app.html'}

def link_of(C, pid):
    return f"{C['base_url'] or 'https://<โดเมน>'}/p/{pid}/"

def plain(s):
    return re.sub(r'==|\+\+|~~', '', str(s))

def check(posts, path):
    """ใช้ตัวตรวจของคลัง (CB.err/warn สะสมใน CB.errors) + กติกาของโพสต์"""
    rel = os.path.relpath(path, ROOT)
    for p in posts:
        pid = p.get('id', '?'); w = f'{rel}#{pid}'
        if not ID_RE.match(str(pid)): CB.err(w, 'รหัสต้องเป็น mk-<ชนิด>-0001')
        t = p.get('type')
        if t not in TYPES: CB.err(w, f'type ต้องเป็นหนึ่งใน {sorted(TYPES)}'); continue
        if not str(pid).startswith(f'mk-{t}-'): CB.err(w, 'ชนิดในรหัสไม่ตรงกับ type')
        if p.get('course') not in COURSES: CB.err(w, 'course ต้องเป็น a2 b1 b2 c1 c2')
        if p.get('status') not in ('draft', 'approved', 'retired'): CB.err(w, 'status ต้องเป็น draft/approved/retired')
        for k in ('topic', 'head', 'caption'):
            if not p.get(k): CB.err(w, f'ขาด {k}')
        if len(str(p.get('head', ''))) > HEAD_MAX: CB.err(w, f'head ยาวเกิน {HEAD_MAX} ตัวอักษร (ภาพจะแน่นเกิน)')
        cap = str(p.get('caption', ''))
        if cap.count('{link}') != 1: CB.err(w, 'caption ต้องมี {link} 1 ครั้ง (ทุกโพสต์ต้องพาเข้าเว็บเรียน)')
        if cap.find('{link}') > 300: CB.err(w, '{link} ต้องอยู่ในช่วงต้นของแคปชัน (300 ตัวอักษรแรก) คนเห็นก่อนกด "ดูเพิ่มเติม"')
        body = json.dumps(p, ensure_ascii=False)
        for b in CB.BANNED:
            if b.lower() in body.lower(): CB.err(w, f'มีคำต้องห้าม "{b}"')
        if re.search(r'#\w*(aptis|ielts|toeic|toefl|edusynch|linguaskill|tutep|cutep)', body, re.I): CB.err(w, 'ห้ามแฮชแท็กชื่อชุดทดสอบ')
        if t == 'quiz':
            if not p.get('stem'): CB.err(w, 'quiz ต้องมี stem')
            if len(str(p.get('stem', ''))) > EN_MAX: CB.err(w, f'stem ยาวเกิน {EN_MAX} ตัวอักษร')
            CB.check_choices(w, p.get('choices'), __import__('collections').Counter())
            right = str((p.get('choices') or [{}])[0].get('t', ''))
            if right and re.search(r'(?<![A-Za-z])' + re.escape(right) + r'(?![A-Za-z])', cap, re.I):
                CB.err(w, 'แคปชันของ quiz มีคำตอบที่ถูกอยู่ (ห้ามเฉลยในโพสต์)')
            if re.search(r'เฉลย\s*[:：]?\s*(ข้อ)?\s*[1-4]', cap): CB.err(w, 'แคปชันของ quiz ห้ามบอกเฉลยของตัวเอง')
        if t == 'word':
            for k in ('word', 'pos', 'th', 'example', 'example_th'):
                if not p.get(k): CB.err(w, f'word ต้องมี {k}')
        if t == 'trap':
            for k in ('wrong', 'right', 'note'):
                if not p.get(k): CB.err(w, f'trap ต้องมี {k}')
            if plain(p.get('wrong', '')).strip().lower() == plain(p.get('right', '')).strip().lower(): CB.err(w, 'wrong กับ right เหมือนกัน')
        if t in ('class', 'tip'):
            ls = p.get('lines') or []
            lo, hi = (2, 3) if t == 'class' else (0, 2)
            if not lo <= len(ls) <= hi: CB.err(w, f'{t} ต้องมี lines {lo}–{hi} บรรทัด')
            for l in ls:
                if not isinstance(l, dict) or not l.get('en') or not l.get('th'): CB.err(w, 'lines แต่ละบรรทัดต้องมี en และ th')
                elif len(l['en']) > 60: CB.err(w, f'บรรทัดยาวเกิน 60 ตัวอักษร: {l["en"][:30]}...')
            if t == 'tip' and not p.get('note'): CB.err(w, 'tip ต้องมี note')
        for k in ('note',):
            if p.get(k):
                CB.check_voice(f'{w} {k}', p[k], max_hl=2)
                if len(plain(p[k])) > NOTE_MAX: CB.err(w, f'{k} ยาวเกิน {NOTE_MAX} ตัวอักษร (ภาพจะแน่นเกิน)')
        for k in ('stem', 'wrong', 'right', 'word', 'example'):
            if p.get(k): CB.check_voice(f'{w} {k}', str(p[k]), allow_hl=False)
        more = p.get('more') or []
        if t == 'recap':
            if more: CB.warn(w, 'recap ไม่ต้องมี more (ปลายทางคือแบบวัดระดับ)')
        elif not 4 <= len(more) <= 5: CB.err(w, 'ต้องมี more 4–5 ข้อ (ชุดสั้นบนเว็บ)')
        st = __import__('collections').Counter()
        for j, m in enumerate(more, 1):
            if not isinstance(m, dict) or not m.get('stem'): CB.err(w, f'more ข้อ {j} ต้องมี stem'); continue
            CB.check_voice(f'{w} more {j} stem', str(m['stem']), allow_hl=False)
            CB.check_choices(f'{w} more {j}', m.get('choices'), st)
    return posts

def shuffled(seed, choices):
    order = list(range(len(choices)))
    random.Random(int(hashlib.sha256(seed.encode()).hexdigest(), 16)).shuffle(order)
    return {'choices': [{'t': choices[i]['t'], 'why': choices[i]['why']} for i in order], 'answer': order.index(0)}

def build_post(p, C):
    """รูปแบบเดียวกับข้อในคลังที่ build แล้ว เพื่อใช้ตัวแสดงข้อ renderItem และตัวตรวจ grade ตัวเดียวกับแอป"""
    out = {k: v for k, v in p.items() if k not in ('choices', 'more')}
    out['link'] = link_of(C, p['id'])
    if p['type'] == 'quiz':
        out['item'] = {'id': p['id'], 'kind': 'mcq', 'skill': 'gm', 'stem': p['stem'], **shuffled(p['id'], p['choices'])}
        out['image_choices'] = [c['t'] for c in out['item']['choices']]          # ภาพใช้ลำดับเดียวกับเว็บ คนจะได้จำเลขข้อได้
    out['more'] = [{'id': f"{p['id']}-{j}", 'kind': 'mcq', 'skill': 'gm', 'stem': m['stem'], 'explain': m.get('explain'), **shuffled(f"{p['id']}:{j}", m['choices'])}
                   for j, m in enumerate(p.get('more') or [], 1)]
    tags = ' '.join(C['hashtags'])
    out['caption_text'] = str(p['caption']).replace('{link}', out['link']) + (f'\n\n{tags}' if tags else '')
    out['comment_text'] = f"ลิงก์ฝึกต่อ (ไม่ต้องสมัคร): {out['link']}"
    return out

def review_html(posts, C):
    e = lambda s: html.escape(str(s))
    def r(s):
        s = e(s)
        for pat, c in ((r'==(.+?)==', '#FFE873'), (r'\+\+(.+?)\+\+', '#B9EFC5'), (r'~~(.+?)~~', '#FFC9D6')): s = re.sub(pat, rf'<mark style="background:{c};color:#12233F">\1</mark>', s)
        return s
    def ch(it):
        return '<ol>' + ''.join(f'<li{" class=ok" if n == it["answer"] else ""}><span class="en">{e(c["t"])}</span>{" <b>ข้อถูก</b>" if n == it["answer"] else ""}<div class="why">{r(c["why"])}</div></li>' for n, c in enumerate(it['choices'])) + '</ol>'
    cards = []
    for p in posts:
        img = os.path.join(ROOT, 'marketing', 'out', p['id'] + '.png')
        pic = ''
        if os.path.exists(img):
            import base64
            pic = f'<img alt="ภาพโพสต์ {e(p["id"])}" src="data:image/png;base64,{base64.b64encode(open(img, "rb").read()).decode()}">'
        body = f'<div class="meta">{e(p["id"])} · {e(p["type"])} · {e(p["course"]).upper()} · {e(p["topic"])} · <b>{e(p["status"])}</b></div>{pic}'
        body += f'<h3>แคปชัน</h3><pre>{e(p["caption_text"])}</pre><h3>คอมเมนต์แรก</h3><pre>{e(p["comment_text"])}</pre>'
        if p.get('item'): body += '<h3>โจทย์ในภาพ (เฉลยอยู่บนเว็บเท่านั้น)</h3><p class="en">' + e(p['item']['stem']) + '</p>' + ch(p['item'])
        if p['more']: body += f'<h3>ชุดสั้นบนเว็บ {len(p["more"])} ข้อ</h3>' + ''.join(f'<p class="en">{n}. {e(m["stem"])}</p>' + ch(m) for n, m in enumerate(p['more'], 1))
        cards.append(f'<section class="card">{body}</section>')
    warn = '' if C['base_url'] else '<p class="warn">ยังไม่ได้ตั้งโดเมน ลิงก์ในแคปชันจึงเป็น https://&lt;โดเมน&gt; ตั้งค่าที่ marketing/config.yaml แล้วสร้างใหม่ก่อนโพสต์จริง</p>'
    return f'''<title>ตรวจโพสต์เพจ</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Serif:wght@400;600&display=swap">
<style>
:root{{--paper:#F5F7F8;--card:#fff;--ink:#12233F;--ink2:#51607A;--line:#D7DEE6;--ok-soft:#E1F3E8;--ok:#17794A;--warn-soft:#FFF1D2;--warn:#8A5A00}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--paper:#0E1622;--card:#172233;--ink:#E9EEF5;--ink2:#A3B1C6;--line:#2B3A50;--ok-soft:#143524;--ok:#6FD39B;--warn-soft:#3A2E12;--warn:#F2C56B;color-scheme:dark}}}}
:root[data-theme="dark"]{{--paper:#0E1622;--card:#172233;--ink:#E9EEF5;--ink2:#A3B1C6;--line:#2B3A50;--ok-soft:#143524;--ok:#6FD39B;--warn-soft:#3A2E12;--warn:#F2C56B;color-scheme:dark}}
*{{box-sizing:border-box}}body{{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;font-size:16px;line-height:1.6;margin:0;padding:16px max(16px,env(safe-area-inset-right)) 40px max(16px,env(safe-area-inset-left))}}
main{{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px}}
img{{width:100%;height:auto;border-radius:10px;border:1px solid var(--line)}}
.meta{{font-size:.8rem;color:var(--ink2)}} h1{{font-size:1.4rem;margin:0}} h3{{font-size:.95rem;margin:8px 0 0}}
pre{{white-space:pre-wrap;font-family:inherit;background:var(--paper);border-radius:8px;padding:10px;margin:0;overflow-wrap:anywhere}}
.en{{font-family:"IBM Plex Serif",Georgia,serif}} ol{{margin:0;padding-left:22px}} li{{margin:4px 0}} li.ok{{background:var(--ok-soft);border-radius:6px;padding:2px 6px}}
li b{{color:var(--ok);font-size:.8rem}} .why{{font-size:.85rem;color:var(--ink2)}} .warn{{background:var(--warn-soft);color:var(--warn);border-radius:10px;padding:10px 12px;margin:0}}
</style>
<main><h1>ตรวจโพสต์เพจ ({len(posts)} โพสต์)</h1>
<p class="meta">ร่างทั้งหมด ยังไม่ได้เผยแพร่ · ตอบกลับว่าโพสต์ไหนผ่าน/ต้องแก้ แล้ว Claude เปลี่ยนสถานะเป็น approved · ข้อในภาพเรียงตัวเลือกตามลำดับเดียวกับบนเว็บ</p>{warn}
{''.join(cards)}</main>'''

def main(argv):
    only_check = '--check' in argv
    files = [a for a in argv if not a.startswith('--')] or sorted(f for f in glob.glob(os.path.join(ROOT, 'marketing', 'posts', '*.yaml')) if not os.path.basename(f).startswith('_'))
    if not files: print('ไม่มีไฟล์โพสต์ใน marketing/posts/ (ไฟล์ที่ขึ้นต้นด้วย _ เป็นตัวอย่าง ระบุชื่อไฟล์ตรง ๆ ถ้าจะลองสร้าง)'); return 0
    C = cfg(); posts, seen = [], set()
    for f in files:
        data = yaml.safe_load(open(f, encoding='utf-8')) or []
        for p in check(data, f):
            if p.get('id') in seen: CB.err(os.path.relpath(f, ROOT), f"รหัสซ้ำ {p.get('id')}")
            seen.add(p.get('id')); posts.append(p)
    for x in CB.warns: print(x)
    for x in CB.errors: print(x)
    print(f'ตรวจ {len(posts)} โพสต์ · {len(CB.errors)} error · {len(CB.warns)} warning')
    if CB.errors: return 1
    if not C['base_url']: print('WARN  ยังไม่ได้ตั้ง base_url ใน marketing/config.yaml · ลิงก์เป็น https://<โดเมน> ห้ามโพสต์จริง')
    if only_check: return 0
    built = [build_post(p, C) for p in posts]
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    json.dump({'config': C, 'posts': built}, open(os.path.join(ROOT, 'build', 'posts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    out = os.path.join(ROOT, 'marketing', 'out'); os.makedirs(out, exist_ok=True)
    for p in built:
        open(os.path.join(out, p['id'] + '.txt'), 'w', encoding='utf-8').write(p['caption_text'] + '\n\n--- คอมเมนต์แรก ---\n' + p['comment_text'] + '\n')
    if shutil.which('node'):
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'render_posts.js')], cwd=ROOT)
        if r.returncode: print('ภาพไม่สำเร็จ'); return 1
    else: print('ไม่มี node · ข้ามการสร้างภาพ')
    os.makedirs(os.path.join(ROOT, 'review', 'out'), exist_ok=True)
    open(os.path.join(ROOT, 'review', 'out', 'posts.html'), 'w', encoding='utf-8').write(review_html(built, C))
    n_ok = sum(p['status'] == 'approved' for p in built)
    print(f'build/posts.json · marketing/out/ ({len(built)} ภาพ+แคปชัน) · review/out/posts.html · อนุมัติแล้ว {n_ok} โพสต์ (เข้า dist/ เมื่อรัน python3 build.py)')
    return 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
