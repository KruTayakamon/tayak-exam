#!/usr/bin/env python3
"""สร้างหน้าตรวจเนื้อหาสำหรับบอส (อ่านบนมือถือ) จากไฟล์คอร์สและคลัง · รัน: python3 review/make_review.py b1 1
ผลลัพธ์: review/out/cefr_<คอร์ส>_w<NN>.html (ไม่ commit · มีเฉลย ห้ามใส่ใน dist/) → publish เป็น artifact ส่วนตัวให้บอสเท่านั้น
ข้อแสดงตามลำดับในไฟล์ต้นทาง: ตัวเลือกแรกคือข้อถูก (หน้าเว็บจริงจะสลับและแสดงเป็น 1 2 3 4)"""
import os, sys, re, html, yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
course, week = sys.argv[1], int(sys.argv[2])
W = yaml.safe_load(open(f'{ROOT}/course/cefr/{course}/w{week:02d}.yaml', encoding='utf-8'))
items = {i['id']: i for i in yaml.safe_load(open(f'{ROOT}/bank/cefr/{course}/w{week:02d}.yaml', encoding='utf-8'))}
e = lambda s: html.escape(str(s))
k = lambda s: re.sub(r'&lt;k&gt;(.*?)&lt;/k&gt;', r'<u class="k">\1</u>', e(s))
def r(s):
    s = e(s)
    for pat, c in ((r'==(.+?)==', 'y'), (r'\+\+(.+?)\+\+', 'g'), (r'~~(.+?)~~', 'p')): s = re.sub(pat, rf'<mark class="hl {c}">\1</mark>', s)
    return s
NOTE_TH = {'pin': 'จำให้แม่น', 'warn': 'ระวังตรงนี้', 'tip': 'ทริกจำ', 'use': 'เอาไปใช้เลย'}
def choices(cs):
    return '<ol class="ch">' + ''.join(f'<li class="{"ok" if n == 0 else ""}"><span class="en">{e(c["t"])}</span>{" <b class=\"mk\">ข้อถูก</b>" if n == 0 else ""}<div class="why">{r(c["why"])}</div></li>' for n, c in enumerate(cs)) + '</ol>'
def item(iid, n):
    it = items[iid]; h = f'<div class="it"><div class="meta">ข้อ {n} · {e(iid)} · {e(it["skill"])} · {e(it["topic"])} · ระดับ {it["level"]}</div>'
    kd = it['kind']
    if kd == 'mcq': h += f'<p class="en">{e(it["stem"])}</p>' + choices(it['choices'])
    elif kd == 'type': h += f'<p class="en">{e(it["stem"])}</p><p>คำตอบ: <span class="en"><b>{e(it["answer"])}</b></span></p><div class="why">{r(it["why"])}</div>'
    elif kd == 'order': h += f'<p>เรียง: {" / ".join(f"<span class=en>{e(c)}</span>" for c in it["chunks"])}</p><p class="en"><b>{e(it["sentence"])}</b></p><p class="small">{e(it["th"])}</p><div class="why">{r(it["why"])}</div>'
    else:
        if kd == 'cloze': h += f'<pre class="en box">{e(it["text"])}</pre>'
        if kd == 'read': h += f'<p><b class="en">{e(it.get("title",""))}</b></p><div class="en box">' + ''.join(f'<p>{e(p)}</p>' for p in it['passage'].strip().split('\n\n')) + '</div>'
        if kd == 'listen': h += '<div class="box"><div class="small">บทฟัง (เสียงอ่านของเครื่อง)</div>' + ''.join(f'<p class="en"><b>{e(l["who"])}:</b> {e(l["en"])}</p>' for l in it['script']) + '</div>'
        for j, q in enumerate(it['questions'], 1):
            h += f'<p class="en">{("(%d) " % j) if kd == "cloze" else ""}{e(q.get("stem",""))}</p>' + choices(q['choices'])
    if it.get('explain'): h += f'<p class="small">หลักที่ควรจำ: {r(it["explain"])}</p>'
    return h + '</div>'
out = [f'''<title>ตรวจเนื้อหา {course.upper()} สัปดาห์ {week}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;500;600&display=swap">
<style>
:root{{--paper:#F5F7F8;--card:#fff;--ink:#12233F;--ink2:#51607A;--line:#D7DEE6;--accent:#0B6B5B;--ok-soft:#E1F3E8;--ok:#17794A;--warn-soft:#FFF1D2;--warn:#8A5A00}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--paper:#0E1622;--card:#172233;--ink:#E9EEF5;--ink2:#A3B1C6;--line:#2B3A50;--accent:#4FC3A9;--ok-soft:#143524;--ok:#6FD39B;--warn-soft:#3A2E12;--warn:#F2C56B;color-scheme:dark}}}}
:root[data-theme="dark"]{{--paper:#0E1622;--card:#172233;--ink:#E9EEF5;--ink2:#A3B1C6;--line:#2B3A50;--accent:#4FC3A9;--ok-soft:#143524;--ok:#6FD39B;--warn-soft:#3A2E12;--warn:#F2C56B;color-scheme:dark}}
*{{box-sizing:border-box}}body{{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;font-size:16px;line-height:1.6;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:16px 48px}}
.wrap{{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:14px}}h1,h2,h3,p,ol,pre{{margin:0}}h1{{font-size:1.45rem;line-height:1.3}}h2{{font-size:1.15rem;margin-top:10px;padding-top:14px;border-top:2px solid var(--ink)}}h3{{font-size:1rem;color:var(--accent)}}
.en{{font-family:"IBM Plex Serif",Georgia,serif;font-size:1.03rem}}.small,.meta{{font-size:.82rem;color:var(--ink2)}}.note{{background:var(--warn-soft);color:var(--warn);border-radius:10px;padding:10px 12px;font-size:.85rem}}
.card,.it{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0}}
.ch{{padding-left:22px;display:flex;flex-direction:column;gap:6px}}.ch li{{padding:6px 8px;border-radius:8px}}.ch li.ok{{background:var(--ok-soft)}}.mk{{font-size:.75rem;color:var(--ok)}}.why{{font-size:.86rem;color:var(--ink2)}}
.box{{border-left:3px solid var(--accent);padding:6px 12px;white-space:pre-wrap;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:8px}}pre.box{{font-size:1rem}}u.k{{text-decoration-color:var(--accent);text-decoration-thickness:2px;text-underline-offset:3px}}
ul{{margin:0;padding-left:20px}}.hl{{padding:0 .15em;border-radius:.2em;color:#12233F}}.hl.y{{background:#FFE873}}.hl.g{{background:#B9EFC5}}.hl.p{{background:#FFC9D6}}.sticky{{background:#FFF6C2;color:#3A3320;padding:10px 12px;border-radius:2px 2px 10px 2px;transform:rotate(-.6deg);max-width:92%}}s{{color:var(--ink2)}}
</style>
<div class="wrap">
<div class="note">เนื้อหาร่าง รอบอสตรวจ · มีเฉลย ห้ามเผยแพร่ · ตัวเลือกแรกของทุกข้อคือข้อถูก หน้าเว็บจริงจะสลับลำดับและแสดงเป็น 1 2 3 4 · พบจุดที่ต้องแก้ แจ้งรหัสข้อ (เช่น {course}-w{week:02d}-007) ได้เลย</div>
<h1>คอร์ส {e(course.upper())} สัปดาห์ {week}: {e(W["theme_th"])}</h1>
<p>{e(W["focus_th"])}</p>
<div class="card"><h3>เมื่อจบสัปดาห์ ผู้เรียนทำได้</h3><ul>{"".join(f"<li>{e(c)}</li>" for c in W["can_do_th"])}</ul></div>''']
n = 0
for s in W['sessions']:
    out.append(f'<h2>วันที่ {s["day"]} · {e(s["title_th"])}</h2><p class="small">{s["minutes"]} นาที · ทักษะ {e(s["skill"])}</p>')
    L = s.get('lesson')
    if L:
        c = f'<div class="card"><h3>บทเรียนย่อ</h3><p>{r(L["rule_th"])}</p>' + ''.join(f'<div><span class="en">{k(x["en"])}</span><div class="small">{r(x["th"])}</div></div>' for x in L['examples'])
        for nt in L.get('notes', []): c += f'<div class="sticky"><b class="small">{NOTE_TH.get(nt["kind"], "")}</b><br>{r(nt["th"])}</div>'
        for sg in L.get('signals', []): c += f'<p class="small"><b>{e(sg["label_th"])}:</b> <span class="en">{e(", ".join(sg["words"]))}</span></p>'
        if L.get('words'): c += '<ol>' + ''.join(f'<li><span class="en"><b>{e(w["w"])}</b></span> ({e(w["pos"])}) {e(w["th"])} · <span class="en">{e(w["ex"])}</span></li>' for w in L['words']) + '</ol>'
        t = L['thai_trap']; c += f'<h3>จุดที่คนไทยพลาดบ่อย</h3><p>{r(t["intro_th"])}</p>' + ''.join(f'<p><s class="en">{e(a)}</s> → <span class="en"><b>{e(b)}</b></span></p>' for a, b in zip(t['wrong'], t['right']))
        out.append(c + '</div>')
    lab = s.get('lab')
    if lab:
        out.append(f'<div class="card"><h3>ห้องฝึก{"พูด" if lab["mode"]=="speak" else "เขียน"}</h3><p>{e(lab["prompt_th"])}</p><p class="small">โครง</p>' + ''.join(f'<p class="en">{e(x)}</p>' for x in lab['frame']) + f'<p class="small">ตัวอย่างระดับผ่านเกณฑ์</p><p class="en box">{e(lab["model_pass"])}</p><p class="small">ตัวอย่างระดับดี</p><p class="en box">{e(lab["model_good"])}</p><p class="small">ขั้นตอน</p><ol>{"".join(f"<li>{e(x)}</li>" for x in lab["steps_th"])}</ol><p class="small">รายการตรวจตนเอง</p><ul>{"".join(f"<li>{e(x)}</li>" for x in lab["checklist_th"])}</ul></div>')
    if s.get('mock'): out.append(f'<div class="card"><p>ชุดย่อยจับเวลา {s["mock"]["items"]} ข้อ {s["mock"]["time_min"]} นาที</p><p class="small">{e(s["mock"].get("note_th",""))}</p></div>')
    for label, key in (('ข้อเช็กความเข้าใจ', 'check'), ('ข้อฝึก', 'practice')):
        if s.get(key):
            out.append(f'<h3>{label} ({len(s[key])})</h3>')
            for iid in s[key]: n += 1; out.append(item(iid, n))
    if s.get('use'): u = s['use']; out.append(f'<div class="card"><h3>ขั้นใช้</h3><p>{e(u["prompt_th"])}</p><p class="en">{e(u["frame"])}</p><p class="small">ตัวอย่าง</p><p class="en">{e(u["model"])}</p></div>')
    if s.get('classroom'): out.append(f'<div class="card"><h3>ประโยคใช้ในห้องเรียน</h3><p class="en">{e(s["classroom"]["en"])}</p><p class="small">{e(s["classroom"]["th"])}</p></div>')
out.append('</div>')
os.makedirs(f'{ROOT}/review/out', exist_ok=True)
p = f'{ROOT}/review/out/cefr_{course}_w{week:02d}.html'
open(p, 'w', encoding='utf-8').write('\n'.join(out)); print(p, n, 'ข้อ')
