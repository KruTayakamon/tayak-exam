#!/usr/bin/env python3
# compact → bank/cefr/<c>/pNN.yaml · usage: pool.py c w src.txt
import sys, json, re
c, w, src = sys.argv[1], int(sys.argv[2]), sys.argv[3]
q = lambda s: json.dumps(s.strip(), ensure_ascii=False)
raw = '\n' + open(src, encoding='utf-8').read()
blocks = [b.strip('\n') for b in re.split(r'\n(?=[GVRL] [\w-]+ \d)', raw) if b.strip() and not b.strip().startswith('#')]
out = [f"# คอร์ส {c} · ข้อสำรองชุดย่อยวันที่ 6 · สัปดาห์ {w} · 20 คะแนน (gm 9 · vo 6 · rd 3 · li 2) · pool: true",
       "# ไม่อยู่ในเซสชันวันที่ 1–5 · ระบบเลือกไปใช้ในชุดย่อยจับเวลา · เขียน 24 พ.ย. 2569 · บอส: \"ทำข้อสำรองชุดย่อยตามแนะนำได้เลย\""]


_seen = set()


def ch(line, ind):
    t, why = line[1:].split('|', 1)
    t, why = t.strip(), why.strip()
    if len(why) < 15:
        why = f"ในบทไม่ได้พูดถึง {t}" if ('กล่าวถึง' in why or 'พูดถึง' in why) else why + " จึงใช้ไม่ได้"
    if why in _seen:
        why = f"{why} ({t})"
    _seen.add(why)
    return f"{ind}- {{t: {q(t)}, why: {q(why)}}}"


import glob
_have = {}
for f in glob.glob('/home/user/tayak-exam/bank/cefr/*/*.yaml'):
    if f.endswith(f'/{c}/p{w:02d}.yaml'): continue
    for m in re.finditer(r'^\s*(?:-\s*)?stem:\s*(.+)$', open(f, encoding='utf-8').read(), re.M):
        t = m.group(1).strip()
        if t[:1] in '"\'':
            try: t = json.loads(t) if t[0] == '"' else t.strip("'")
            except Exception: t = t.strip('"')
        _have[re.sub(r'\s+', '', t).lower()] = f
_dup = []
_grp = []
n = 43
pts = {}
for b in blocks:
    L = b.split('\n')
    head = L[0].split('|')
    k, topic, lv = head[0].split()
    i = f"cefr-{c}-w{w:02d}-{n:03d}"
    n += 1
    kind = {'G': 'mcq', 'V': 'mcq', 'R': 'read', 'L': 'listen'}[k]
    skill = {'G': 'gm', 'V': 'vo', 'R': 'rd', 'L': 'li'}[k]
    out += [f"- id: {i}", f"  kind: {kind}", f"  skill: {skill}", f"  topic: {topic}", f"  level: {lv}", "  pool: true"]
    body = L[1:]
    if k in 'GV':
        body = [x for x in body if x.strip()]
        ops = [x for x in body if x[:1] in '=-']
        ex = [x for x in body if x.startswith('!')]
        assert ops[0][0] == '=' and len(ops) == 4, (i, ops)
        _k = re.sub(r'\s+', '', body[0]).lower()
        if _k in _have: _dup.append((body[0], _have[_k]))
        out.append(f"  stem: {q(body[0])}")
        out.append("  choices:")
        _seen.clear()
        out += [ch(x, "    ") for x in ops]
        _grp.append((body[0][:50], [len(x[1:].split('|')[0].strip()) for x in ops]))
        if ex:
            out.append(f"  explain: {q(ex[0][1:])}")
        pts[skill] = pts.get(skill, 0) + 1
    else:
        qi = next(j for j, x in enumerate(body) if x.startswith('Q '))
        pre = body[:qi]
        while pre and not pre[-1].strip():
            pre.pop()
        while pre and not pre[0].strip():
            pre.pop(0)
        if k == 'R':
            out.append(f"  title: {q(head[1])}")
            out.append("  passage: |")
            out += ["    " + x if x.strip() else "" for x in pre]
        else:
            out.append("  script:")
            for x in pre:
                if x.strip():
                    who, en = x.split(':', 1)
                    out.append(f"    - {{who: {who.strip()}, en: {q(en)}}}")
        out.append("  questions:")
        for x in body[qi:]:
            if x.startswith('Q '):
                out.append(f"    - stem: {q(x[2:])}")
                _grp.append((x[2:52], []))
                _seen.clear()
                out.append("      choices:")
                pts[skill] = pts.get(skill, 0) + 1
            elif x[:1] in '=-':
                out.append(ch(x, "        "))
                _grp[-1][1].append(len(x[1:].split('|')[0].strip()))
    out.append("  status: approved")
_L = [g for g in _grp if g[1][0] > max(g[1][1:])]
_S = [g for g in _grp if g[1][0] < min(g[1][1:])]
if len(_L) > 7 or len(_S) > 7:
    print(f'BAL {c} {w} longest {len(_L)} shortest {len(_S)}')
    for g in (_L if len(_L) > 7 else _S): print('   ', g)
_hl = [m for m in re.findall(r'(==|\+\+|~~)(.+?)\1', raw) if len(m[1]) > 40]
if _hl:
    print('HL>40', [m[1] for m in _hl]); sys.exit(1)
if _dup:
    print('DUP', *_dup, sep='\n  '); sys.exit(1)
assert n == 61, n
assert pts == {'gm': 9, 'vo': 6, 'rd': 3, 'li': 2}, pts
open(f"/home/user/tayak-exam/bank/cefr/{c}/p{w:02d}.yaml", 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('ok', c, w)
