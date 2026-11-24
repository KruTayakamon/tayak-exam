#!/usr/bin/env python3
"""สร้างเว็บ CEFR for You · รันจากรากของ repo
  python3 build.py           → dist/        เว็บจริง (ไม่มีเนื้อหาและเฉลย · เนื้อหามาจากเซิร์ฟเวอร์) · โฟลเดอร์นี้คือสิ่งที่ Cloudflare Pages เสิร์ฟ
  python3 build.py --demo    → dist-demo/   รุ่นสาธิต มีเนื้อหาพร้อมเฉลยฝังอยู่ ใช้ทดสอบในเครื่องเท่านั้น **ห้าม deploy** (ไม่ commit)
  python3 build.py --bundle  → build/demo_bundle.html  รุ่นสาธิตไฟล์เดียว สำหรับ publish เป็น artifact ส่วนตัวให้บอสลองเล่น
ต้องรัน python3 bank/build.py ก่อนเมื่อใช้ --demo หรือ --bundle"""
import os, re, sys, json, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB, ENG = os.path.join(ROOT, 'web'), os.path.join(ROOT, 'engine')
ENGINE_FILES = ('engine.mjs', 'assemble.mjs', 'grade.mjs', 'pricing.mjs')

def dict_json():
    """พจนานุกรมกดค้างที่คำ (tools/make_dict.py) · ไม่มีเฉลย ส่งขึ้นเว็บจริงได้"""
    sys.path.insert(0, os.path.join(ROOT, 'tools')); import make_dict
    return json.dumps(make_dict.main(), ensure_ascii=False, separators=(',', ':'))

def demo_data():
    items = json.load(open(os.path.join(ROOT, 'build', 'items.json'), encoding='utf-8'))
    courses = {c: json.load(open(os.path.join(ROOT, 'build', f'course_cefr_{c}.json'), encoding='utf-8')) for c in ('a2', 'b1', 'b2', 'c1', 'c2') if os.path.exists(os.path.join(ROOT, 'build', f'course_cefr_{c}.json'))}
    cfg = json.load(open(os.path.join(ENG, 'config.json'), encoding='utf-8'))
    return 'globalThis.DEMO_DATA=' + json.dumps({'config': cfg, 'course': courses['b1'], 'courses': courses, 'items': {i['id']: i for i in items}}, ensure_ascii=False) + ';'

def post_pages(out, demo):
    """หน้าเว็บของโพสต์เพจ /p/<รหัส>/ จาก build/posts.json (สร้างด้วย tools/make_posts.py)
    เว็บจริง: เฉพาะโพสต์ที่บอสอนุมัติ (status: approved) · รุ่นสาธิต: ทุกโพสต์ไว้ดูตัวอย่าง"""
    src = os.path.join(ROOT, 'build', 'posts.json')
    if not os.path.exists(src): return 0
    import html as H
    D = json.load(open(src, encoding='utf-8')); C = D['config']; n = 0
    feed = []                                    # รายการสำหรับแท็บโพสต์ในแผงเจ้าของ (p/posts.json) · มีเฉพาะโพสต์ที่อยู่บนเว็บอยู่แล้ว ไม่มีเฉลยเพิ่ม
    for p in D['posts']:
        if not demo and p['status'] != 'approved': continue
        feed.append({'id': p['id'], 'type': p['type'], 'head': p['head'], 'caption': p['caption_text'], 'comment': p['comment_text'], 'link': p['link'],
                     'img': f"p/{p['id']}/og.png" if os.path.exists(os.path.join(ROOT, 'marketing', 'out', p['id'] + '.png')) else None})
        d = os.path.join(out, 'p', p['id']); os.makedirs(d, exist_ok=True)
        img = os.path.join(ROOT, 'marketing', 'out', p['id'] + '.png')
        og = ''
        if os.path.exists(img):
            shutil.copyfile(img, os.path.join(d, 'og.png'))
            og = f'<meta property="og:image" content="{H.escape(p["link"])}og.png">\n<meta property="og:image:width" content="1080">\n<meta property="og:image:height" content="1350">\n'
        data = {k: p.get(k) for k in ('id', 'type', 'course', 'head', 'stem', 'item', 'more', 'word', 'pos', 'th', 'example', 'example_th', 'wrong', 'right', 'note', 'lines')}
        data['placement_path'] = C.get('placement_path')
        desc = 'ตอบแล้วดูเหตุผลทุกตัวเลือก ฝึกต่ออีก 4 ข้อ ไม่ต้องสมัคร · CEFR for You เรียนภาษาอังกฤษ'
        page = f'''<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{H.escape(p["head"])} · CEFR for You</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website"><meta property="og:url" content="{H.escape(p["link"])}">
<meta property="og:title" content="{H.escape(p["head"])}"><meta property="og:description" content="{desc}">
{og}<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<link rel="stylesheet" href="../../css/app.css">
</head><body><div class="wrap" id="app"></div>
<script type="application/json" id="post-data">{json.dumps(data, ensure_ascii=False).replace("</", "<\\/")}</script>
<script type="module" src="../../js/post.js"></script>
</body></html>'''
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(page); n += 1
    if feed: open(os.path.join(out, 'p', 'posts.json'), 'w', encoding='utf-8').write(json.dumps({'posts': feed}, ensure_ascii=False))
    return n

def site(out, demo):
    if os.path.exists(out): shutil.rmtree(out)
    shutil.copytree(WEB, out)
    os.makedirs(os.path.join(out, 'js', 'engine'), exist_ok=True)
    for f in ENGINE_FILES: shutil.copyfile(os.path.join(ENG, f), os.path.join(out, 'js', 'engine', f))
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    open(os.path.join(out, 'data', 'dict.json'), 'w', encoding='utf-8').write(dict_json())
    if demo: open(os.path.join(out, 'js', 'demo_data.js'), 'w', encoding='utf-8').write(demo_data())
    for page in ('app.html', 'placement.html', 'admin.html'):
        p = os.path.join(out, page); html = open(p, encoding='utf-8').read()
        html = html.replace('<!--DEMO_DATA-->', '<script src="js/demo_data.js"></script>') if demo else html.replace('<!--DEMO_DATA-->\n', '')
        open(p, 'w', encoding='utf-8').write(html)
    # หน้าแรกของโดเมน: ยังไม่มีหน้าแนะนำ จึงพาไปหน้าวัดระดับฟรีซึ่งเป็นปลายทางของทุกโพสต์ (เปลี่ยนเป็นหน้าแนะนำเมื่อสร้างแล้ว)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CEFR for You</title><meta http-equiv="refresh" content="0; url=placement.html"><link rel="canonical" href="placement.html"></head><body><p><a href="placement.html">วัดระดับภาษาอังกฤษฟรี</a></p></body></html>\n')
    np = post_pages(out, demo)
    if np: print(f'{os.path.relpath(out, ROOT)}/p/ หน้าโพสต์ {np} หน้า')
    print(f'{os.path.relpath(out, ROOT)}/ สร้างแล้ว' + (' (รุ่นสาธิต มีเฉลย ห้าม deploy)' if demo else ' (เว็บจริง ไม่มีเนื้อหา)'))

# ---------- รวมเป็นไฟล์เดียว: ห่อแต่ละโมดูลเป็นฟังก์ชันของตัวเอง แล้วต่อ import/export ด้วยมือ ----------
IMPORT = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$", re.M)
EXPORT = re.compile(r'^export\s+(async\s+function|function|const|let)\s+([A-Za-z_$][\w$]*)', re.M)
def bundle_js():
    mods, order = {}, []
    def path_of(spec, base):
        return os.path.normpath(os.path.join(os.path.dirname(base), spec))
    def real(p):
        return p.replace(os.path.join(WEB, 'js', 'engine'), ENG) if os.path.join('js', 'engine') in p else p
    def visit(p):
        if p in mods: return
        src = open(real(p), encoding='utf-8').read()
        deps = [(names, path_of(spec, p)) for names, spec in IMPORT.findall(src)]
        mods[p] = None
        for _, d in deps: visit(d)
        names = [m[1] for m in EXPORT.findall(src)]
        body = IMPORT.sub(lambda m: 'const {' + m.group(1) + '} = M[' + json.dumps(os.path.relpath(path_of(m.group(2), p), WEB)) + '];', src)
        if re.search(r'^\s*(import|export)\s+(?!async\s+function|function|const|let)', body, re.M): raise SystemExit(f'รูปแบบ import/export ที่ตัวรวมไฟล์ไม่รองรับใน {p}')
        body = EXPORT.sub(lambda m: m.group(1) + ' ' + m.group(2), body)
        mods[p] = 'M[' + json.dumps(os.path.relpath(p, WEB)) + '] = await (async () => {\n' + body + '\nreturn {' + ', '.join(names) + '};\n})();'
        order.append(p)
    visit(os.path.join(WEB, 'js', 'app.js'))
    return 'const M = {};\n' + '\n'.join(mods[p] for p in order)

def bundle():
    css = open(os.path.join(WEB, 'css', 'app.css'), encoding='utf-8').read()
    html = ('<title>CEFR for You ทดลองเรียน</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400&display=swap">\n'
            '<style>\n' + css + '\n</style>\n<div class="wrap" id="app"></div>\n<script>' + demo_data().replace('</', '<\\/') + 'globalThis.DICT_DATA=' + dict_json().replace('</', '<\\/') + ';</script>\n<script type="module">\n' + bundle_js().replace('</script', '<\\/script') + '\n</script>\n')
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    p = os.path.join(ROOT, 'build', 'demo_bundle.html'); open(p, 'w', encoding='utf-8').write(html)
    print(f'build/demo_bundle.html {len(html)//1024} KB (มีเฉลย เผยแพร่ได้เฉพาะแบบส่วนตัว)')

if __name__ == '__main__':
    if '--bundle' in sys.argv: bundle()
    elif '--demo' in sys.argv: site(os.path.join(ROOT, 'dist-demo'), True)
    else: site(os.path.join(ROOT, 'dist'), False)
