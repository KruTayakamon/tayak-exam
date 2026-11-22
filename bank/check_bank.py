#!/usr/bin/env python3
"""ตัวตรวจคุณภาพคลังข้อและไฟล์คอร์ส · รัน: python3 bank/check_bank.py  (ต้องผ่านก่อน commit)
กติกาอยู่ใน docs/writing/cefr.md และ docs/phase-a/05_site_architecture.md ข้อ 5.3
คืนค่า 0 เมื่อไม่มี ERROR · WARN ไม่ทำให้ล้ม แต่ต้องอ่าน"""
import sys, re, glob, os, collections
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ID_RE = re.compile(r'^[a-z]+-[a-z0-9]+-w\d{2}-\d{3}$|^[a-z]+-[a-z0-9]+-cp[abc]-\d{3}$|^[a-z]+-[a-z0-9.]+-\d{4}$')
# ชุดวัดผล (course/cefr/_assessment.yaml checkpoint): ไฟล์ bank/cefr/<คอร์ส>/cp_<a|b|c>.yaml ชุดละ 40 คะแนนตามตารางทักษะ
CP_SKILL = {'gm': 18, 'vo': 10, 'rd': 8, 'li': 4}         # gm = mcq 14 + cloze 3 ช่อง + order 1
CP_LEVEL = {1: 16, 2: 18, 3: 6}
KINDS = {'mcq', 'type', 'order', 'cloze', 'read', 'listen'}
SKILLS = {'gm', 'vo', 'rd', 'li', 'wr', 'sp', 'dlg'}
STATUS = {'draft', 'approved', 'retired'}
BANNED = ['ข้อสอบจริง', 'ออกสอบปี', 'ข้อสอบปี 25', 'การันตี', 'ออกแน่', 'Aptis', 'IELTS', 'TOEIC', 'TOEFL', 'EduSynch', 'Linguaskill', 'CU-TEP', 'TU-GET']
MIN_WHY = 15
MAX_LONGEST = 0.35      # ข้อถูกเป็นตัวเลือกที่ยาวที่สุดได้ไม่เกิน 35% ของข้อในไฟล์ (เมื่อมี ≥10 ข้อ)
MAX_SHORTEST = 0.35

errors, warns = [], []
def err(where, msg): errors.append(f'ERROR {where}: {msg}')
def warn(where, msg): warns.append(f'WARN  {where}: {msg}')

def load(path):
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)

def text_of(obj):
    if isinstance(obj, str): return obj
    if isinstance(obj, dict): return ' '.join(text_of(v) for v in obj.values())
    if isinstance(obj, list): return ' '.join(text_of(v) for v in obj)
    return ''

HL = re.compile(r'==(.+?)==|\+\+(.+?)\+\+|~~(.+?)~~')
NOTE_KINDS = {'pin', 'warn', 'tip', 'use'}
STIFF = ['ดังนั้น', 'กล่าวคือ', 'อนึ่ง', 'ทั้งนี้', 'ครับ', 'ค่ะ', 'ท่าน', 'ผู้เรียน']     # คำที่ทำให้เสียงแข็งหรือเป็นทางการเกินไป (เตือน ไม่ล้ม)
def check_voice(where, text, allow_hl=True, max_hl=2, stiff=True):
    """ตรวจข้อความ: เครื่องหมายไฮไลต์ครบคู่ ไม่เกินจำนวน ไม่ยาวเกิน (กติกา docs/writing/voice.md)"""
    if not isinstance(text, str): err(where, 'ต้องเป็นข้อความ (ถ้าขึ้นต้นด้วยเครื่องหมายให้ครอบด้วยเครื่องหมายคำพูด)'); return
    marks = [m.group(1) or m.group(2) or m.group(3) for m in HL.finditer(text)]
    if re.search(r'==|\+\+|~~', HL.sub('', text)): err(where, 'เครื่องหมายไฮไลต์ไม่ครบคู่ (== ++ ~~)')
    if marks and not allow_hl: err(where, 'ห้ามใส่ไฮไลต์ในโจทย์ ตัวเลือก หรือข้อความภาษาอังกฤษ')
    if len(marks) > max_hl: err(where, f'ไฮไลต์ {len(marks)} จุด เกิน {max_hl} จุดต่อข้อความ (เน้นทุกอย่างเท่ากับไม่ได้เน้น)')
    for m in marks:
        if len(m) > 40: err(where, f'ไฮไลต์ยาวเกิน 40 ตัวอักษร: {m[:30]}...')
    if stiff and allow_hl:
        for w in STIFF:
            if re.search(r'(?<!เ)' + re.escape(w), text): warn(where, f'คำว่า "{w}" ทำให้เสียงเป็นทางการ ลองเขียนแบบเพื่อนเล่าให้เพื่อนฟัง'); break

def check_choices(where, choices, stats):
    """ตัวเลือกแรก = ข้อถูก (build สลับลำดับให้) · 4 ตัวเลือก · ทุกตัวมี why"""
    if not isinstance(choices, list) or len(choices) != 4:
        err(where, 'ต้องมี 4 ตัวเลือก'); return
    texts, whys = [], []
    for i, c in enumerate(choices):
        if isinstance(c, dict) and 't' in c and not isinstance(c['t'], (str, int, float)) or isinstance(c, dict) and isinstance(c.get('t'), bool):
            err(where, f'ตัวเลือกที่ {i+1} อ่านเป็น {c.get("t")!r} (yes/no/on/off ต้องครอบเครื่องหมายคำพูด)')
        if not isinstance(c, dict) or not c.get('t') or not c.get('why'):
            err(where, f'ตัวเลือกที่ {i+1} ต้องมี t และ why'); return
        if set(c) - {'t', 'why'}:   # 22 พ.ย. 2569: {t: a, b, why: ...} ที่ไม่ครอบคำพูด YAML ตัดข้อความหลังจุลภาคทิ้งเงียบ ๆ (เคยหลุดไป 12 ข้อ)
            err(where, f'ตัวเลือกที่ {i+1} มีคีย์เกิน {sorted(set(c) - {"t", "why"})} (ข้อความที่มีจุลภาคต้องครอบเครื่องหมายคำพูด)')
        texts.append(str(c['t']).strip()); whys.append(str(c['why']).strip())
        check_voice(f'{where} ตัวเลือก {i+1} why', c['why'], max_hl=1); check_voice(f'{where} ตัวเลือก {i+1}', str(c['t']), allow_hl=False)
        if len(whys[-1]) < MIN_WHY: err(where, f'why ของตัวเลือกที่ {i+1} สั้นเกินไป (<{MIN_WHY})')
    if len(set(t.lower() for t in texts)) != 4: err(where, 'ตัวเลือกซ้ำกัน')
    if len(set(whys)) != 4: err(where, 'why ซ้ำกัน (ต้องอธิบายเฉพาะตัวเลือกนั้น)')
    for t in texts:
        if re.search(r'ถูกทุกข้อ|ไม่มีข้อใดถูก|all of the above|none of the above', t, re.I):
            err(where, 'ห้ามใช้ตัวเลือกแบบ ถูกทุกข้อ/ไม่มีข้อใดถูก')
    lens = [len(t) for t in texts]
    stats['n'] += 1
    if lens[0] > max(lens[1:]): stats['longest'] += 1
    if lens[0] < min(lens[1:]): stats['shortest'] += 1

def check_item(path, it, seen, stats):
    iid = it.get('id', '?'); where = f'{os.path.relpath(path, ROOT)}#{iid}'
    if not ID_RE.match(str(iid)): err(where, 'รูปแบบ id ไม่ถูก (เช่น cefr-b1-w01-001)')
    if iid in seen: err(where, f'id ซ้ำกับ {seen[iid]}')
    seen[iid] = os.path.relpath(path, ROOT)
    for k in ('kind', 'skill', 'topic', 'status'):
        if not it.get(k): err(where, f'ขาดฟิลด์ {k}')
    if it.get('kind') not in KINDS: err(where, f"kind ต้องเป็นหนึ่งใน {sorted(KINDS)}")
    if it.get('skill') not in SKILLS: err(where, f"skill ต้องเป็นหนึ่งใน {sorted(SKILLS)}")
    if it.get('status') not in STATUS: err(where, 'status ต้องเป็น draft/approved/retired')
    if not isinstance(it.get('level'), int) or not 1 <= it['level'] <= 3: err(where, 'level ต้องเป็น 1–3')
    body = text_of(it)
    for b in BANNED:
        if b.lower() in body.lower(): err(where, f'มีคำต้องห้าม "{b}"')
    for f in ('stem', 'sentence', 'text', 'passage'):
        if it.get(f): check_voice(f'{where} {f}', str(it[f]), allow_hl=False)
    for f in ('explain', 'why'):
        if it.get(f): check_voice(f'{where} {f}', it[f], max_hl=1)
    k = it.get('kind')
    if k == 'mcq':
        if not it.get('stem'): err(where, 'ขาด stem')
        check_choices(where, it.get('choices'), stats)
    elif k == 'type':
        if not it.get('stem') or not it.get('answer'): err(where, 'type ต้องมี stem และ answer')
        if not it.get('why') or len(str(it['why'])) < MIN_WHY: err(where, 'type ต้องมี why')
    elif k == 'order':
        ch = it.get('chunks')
        if not isinstance(ch, list) or len(ch) < 4: err(where, 'order ต้องมี chunks ≥ 4 ชิ้น เรียงตามลำดับที่ถูก')
        if not it.get('sentence') or not it.get('th'): err(where, 'order ต้องมี sentence และ th')
        if not it.get('why') or len(str(it['why'])) < MIN_WHY: err(where, 'order ต้องมี why')
    elif k in ('cloze', 'read', 'listen'):
        key = {'cloze': 'text', 'read': 'passage', 'listen': 'script'}[k]
        if not it.get(key): err(where, f'{k} ต้องมี {key}')
        qs = it.get('questions')
        if not isinstance(qs, list) or not qs: err(where, 'ต้องมี questions'); return
        if k == 'cloze':
            n = len(re.findall(r'\(\d+\)\s*_+', it.get('text', '')))
            if n != len(qs): err(where, f'จำนวนช่องว่างในข้อความ ({n}) ไม่เท่ากับ questions ({len(qs)})')
        if k == 'read':
            wc = len(re.findall(r"[A-Za-z']+", it.get('passage', '')))
            if not 60 <= wc <= 400: warn(where, f'บทอ่านยาว {wc} คำ (แนะนำ 60–400)')
        if k == 'listen':
            wc = len(re.findall(r"[A-Za-z']+", text_of(it.get('script'))))
            if wc > 120: warn(where, f'บทฟังยาว {wc} คำ เสียงอ่านของเครื่องเหมาะกับ ≤120 คำ')
        for j, q in enumerate(qs):
            if k != 'cloze' and not q.get('stem'): err(where, f'คำถามที่ {j+1} ขาด stem')
            check_choices(f'{where} q{j+1}', q.get('choices'), stats)
    if k != 'order' and not it.get('explain') and k in ('mcq',) and not it.get('band'): warn(where, 'ไม่มี explain (สรุปหลักที่ควรจำ)')

def points(it):
    return len(it['questions']) if it.get('kind') in ('cloze', 'read', 'listen') else 1

def main():
    seen, items = {}, {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'bank', '*', '**', '*.yaml'), recursive=True)):
        if os.path.basename(path).startswith('_'): continue
        data = load(path) or []
        if not isinstance(data, list): err(os.path.relpath(path, ROOT), 'ไฟล์คลังต้องเป็นรายการ'); continue
        stats = collections.Counter()
        for it in data:
            if not isinstance(it, dict): err(os.path.relpath(path, ROOT), 'ข้อไม่ใช่ mapping'); continue
            check_item(path, it, seen, stats); items[it.get('id')] = it
        if stats['n'] >= 10:
            rel = os.path.relpath(path, ROOT)
            if stats['longest'] / stats['n'] > MAX_LONGEST:
                err(rel, f"ข้อถูกเป็นตัวเลือกยาวที่สุด {stats['longest']}/{stats['n']} เกิน {int(MAX_LONGEST*100)}%")
            if stats['shortest'] / stats['n'] > MAX_SHORTEST:
                err(rel, f"ข้อถูกเป็นตัวเลือกสั้นที่สุด {stats['shortest']}/{stats['n']} เกิน {int(MAX_SHORTEST*100)}%")
    # ชุดวัดผล: ตรวจคะแนนรวม ทักษะ ระดับ และรูปแบบรหัสตามไฟล์
    for path in sorted(glob.glob(os.path.join(ROOT, 'bank', '*', '*', 'cp_*.yaml'))):
        rel = os.path.relpath(path, ROOT); data = load(path) or []
        form = os.path.basename(path)[3]; course = os.path.basename(os.path.dirname(path))
        tot, sk, lv = 0, collections.Counter(), collections.Counter()
        for it in data:
            if not str(it.get('id', '')).startswith(f'cefr-{course}-cp{form}-'): err(rel, f"id {it.get('id')} ต้องขึ้นต้น cefr-{course}-cp{form}-")
            if it.get('kind') == 'type': err(rel, f"{it.get('id')}: ชุดวัดผลไม่ใช้ข้อพิมพ์ (ตรวจคำสะกดบนจอสอบไม่ได้)")
            p_ = points(it); tot += p_; sk[it.get('skill')] += p_; lv[it.get('level')] += p_
        if tot != 40: err(rel, f'ชุดวัดผลต้องมี 40 คะแนน (มี {tot})')
        for k, n in CP_SKILL.items():
            if sk[k] != n: err(rel, f'ทักษะ {k} ต้องมี {n} คะแนน (มี {sk[k]})')
        for k, n in CP_LEVEL.items():
            if abs(lv[k] - n) > 1: err(rel, f'level {k} ต้องมี {n}±1 คะแนน (มี {lv[k]})')
    # ข้อซ้ำ (โจทย์เหมือนกันหลังตัดช่องว่าง)
    stems = collections.defaultdict(list)
    for iid, it in items.items():
        s = re.sub(r'\s+', '', str(it.get('stem') or it.get('sentence') or '')).lower()
        if s: stems[s].append(iid)
    for s, ids in stems.items():
        if len(ids) > 1: err('bank', f'โจทย์ซ้ำกัน: {ids}')
    # ไฟล์คอร์ส
    for path in sorted(glob.glob(os.path.join(ROOT, 'course', '*', '*', 'w*.yaml'))):
        rel = os.path.relpath(path, ROOT); w = load(path)
        for k in ('course', 'week', 'theme_th', 'sessions'):
            if k not in w: err(rel, f'ขาดฟิลด์ {k}')
        used = collections.Counter()
        for s in w.get('sessions', []):
            where = f"{rel} d{s.get('day')}"
            for k in ('day', 'title_th', 'skill', 'minutes'):
                if k not in s: err(where, f'ขาดฟิลด์ {k}')
            ids = list(s.get('check', [])) + list(s.get('practice', []))
            for iid in ids:
                used[iid] += 1
                if iid not in items: err(where, f'อ้างข้อที่ไม่มีในคลัง: {iid}')
            if s.get('type', 'lesson') == 'lesson':
                L = s.get('lesson') or {}
                if not L.get('rule_th'): err(where, 'บทเรียนต้องมี rule_th (กติกา 1–2 บรรทัด)')
                if len(L.get('examples', [])) < 3: err(where, 'บทเรียนต้องมีตัวอย่างอย่างน้อย 3 ประโยค')
                if not L.get('thai_trap'): err(where, 'บทเรียนต้องมี thai_trap (จุดที่คนไทยพลาดบ่อย)')
                if L.get('rule_th'): check_voice(f'{where} rule_th', L['rule_th'])
                for x in L.get('examples', []): check_voice(f'{where} ตัวอย่าง', x.get('th', ''), max_hl=1); check_voice(f'{where} ตัวอย่าง en', re.sub(r'</?k>', '', x.get('en', '')), allow_hl=False)
                if L.get('thai_trap'): check_voice(f'{where} thai_trap', L['thai_trap'].get('intro_th', ''))
                notes = L.get('notes', [])
                if len(notes) > 2: err(where, 'โน้ตแปะได้ไม่เกิน 2 ใบต่อบทเรียน')
                for nt in notes:
                    plain = HL.sub(lambda m: m.group(1) or m.group(2) or m.group(3), str(nt.get('th', '')))
                    if nt.get('kind') not in NOTE_KINDS: err(where, f"โน้ตแปะ kind ต้องเป็นหนึ่งใน {sorted(NOTE_KINDS)}")
                    if not plain or len(plain) > 90: err(where, 'โน้ตแปะต้องมีข้อความ และยาวไม่เกิน 90 ตัวอักษร')
                    else: check_voice(f'{where} โน้ตแปะ', nt['th'], max_hl=1)
                pts = sum(points(items[i]) for i in s.get('practice', []) if i in items)
                if pts < 8: err(where, f'ขั้นฝึกมี {pts} คะแนน ต้องมีอย่างน้อย 8')
                if len(s.get('check', [])) < 2: err(where, 'ต้องมีข้อเช็กความเข้าใจ 2 ข้อ')
                if not s.get('use'): err(where, 'ต้องมีขั้น "ใช้" (use)')
                if not s.get('classroom'): err(where, 'ต้องมี "ประโยคพร้อมใช้" (classroom)')
            if s.get('type') == 'lab':
                lab = s.get('lab') or {}
                for k in ('mode', 'prompt_th', 'frame', 'model_pass', 'model_good', 'checklist_th'):
                    if not lab.get(k): err(where, f'lab ขาด {k}')
            body = text_of(s)
            for b in BANNED:
                if b.lower() in body.lower(): err(where, f'มีคำต้องห้าม "{b}"')
        for iid, n in used.items():
            if n > 1: err(rel, f'ข้อ {iid} ถูกใช้ซ้ำในสัปดาห์เดียวกัน')
        days = sorted(s.get('day') for s in w.get('sessions', []))
        if days != [1, 2, 3, 4, 5, 6]: warn(rel, f'สัปดาห์ควรมีวัน 1–6 (พบ {days})')
    # ผังเนื้อหาคอร์ส (_syllabus.yaml): 12 สัปดาห์ · ศัพท์ 12 คำไม่ซ้ำในคอร์ส · ไฟล์สัปดาห์ที่มีแล้วต้องตรงกับผัง
    for path in sorted(glob.glob(os.path.join(ROOT, 'course', '*', '*', '_syllabus.yaml'))):
        rel = os.path.relpath(path, ROOT); sy = load(path); weeks = sy.get('weeks', [])
        if [w.get('week') for w in weeks] != list(range(1, 13)): err(rel, 'ต้องมีสัปดาห์ 1–12 เรียงตามลำดับ')
        words, topics = collections.Counter(), collections.Counter()
        for w in weeks:
            where = f"{rel} w{w.get('week')}"
            for k in ('theme_th', 'd1', 'd3', 'vocab', 'd4', 'lab_mode', 'lab_task_th', 'can_do_th'):
                if not w.get(k): err(where, f'ขาด {k}')
            if len(w.get('vocab', [])) != 12: err(where, 'ต้องมีศัพท์ 12 คำ')
            if w.get('lab_mode') != ('speak' if w.get('week', 0) % 2 else 'write'): err(where, 'lab_mode ต้องสลับ speak (สัปดาห์คี่) / write (สัปดาห์คู่)')
            for x in w.get('vocab', []): words[x] += 1
            for d in ('d1', 'd3'):
                t = (w.get(d) or {}).get('topic')
                if not t: err(where, f'{d} ขาด topic')
                else: topics[t] += 1
            if not set(w.get('vocab_new', [])) <= set(w.get('vocab', [])): err(where, 'vocab_new ต้องเป็นคำใน vocab')
        for x, n in words.items():
            if n > 1: err(rel, f'ศัพท์ซ้ำในคอร์ส: {x}')
        for t, n in topics.items():
            if n > 1: err(rel, f'หัวข้อไวยากรณ์ซ้ำในคอร์ส: {t}')
        for wp in sorted(glob.glob(os.path.join(os.path.dirname(path), 'w*.yaml'))):
            wk = load(wp); plan = next((w for w in weeks if w['week'] == wk.get('week')), None)
            if not plan: err(os.path.relpath(wp, ROOT), 'ไม่มีสัปดาห์นี้ในผัง'); continue
            if wk.get('theme_th') != plan['theme_th']: err(os.path.relpath(wp, ROOT), 'theme_th ไม่ตรงกับผัง')
            lab = next((s for s in wk.get('sessions', []) if s.get('type') == 'lab'), None)
            if lab and (lab.get('lab') or {}).get('mode') != plan['lab_mode']: err(os.path.relpath(wp, ROOT), 'โหมดห้องฝึกไม่ตรงกับผัง')
            d2 = next((s for s in wk.get('sessions', []) if s.get('day') == 2), None)
            got = [x.get('w') for x in ((d2 or {}).get('lesson') or {}).get('words', [])]
            if got and sorted(got) != sorted(plan['vocab']): err(os.path.relpath(wp, ROOT), f"ศัพท์วันที่ 2 ไม่ตรงกับผัง: ต่างกันที่ {sorted(set(got) ^ set(plan['vocab']))}")
    for w in warns: print(w)
    for e in errors: print(e)
    n_pts = sum(points(i) for i in items.values())
    print(f'ตรวจ {len(items)} ข้อ ({n_pts} คะแนน) · {len(errors)} error · {len(warns)} warning')
    return 1 if errors else 0

if __name__ == '__main__':
    sys.exit(main())
