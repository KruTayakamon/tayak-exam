#!/usr/bin/env python3
"""สร้างเว็บ CEFR for Kru · รันจากรากของ repo
  python3 build.py           → dist/        เว็บจริง (ไม่มีเนื้อหาและเฉลย · เนื้อหามาจากเซิร์ฟเวอร์) · โฟลเดอร์นี้คือสิ่งที่ Cloudflare Pages เสิร์ฟ
  python3 build.py --demo    → dist-demo/   รุ่นสาธิต มีเนื้อหาพร้อมเฉลยฝังอยู่ ใช้ทดสอบในเครื่องเท่านั้น **ห้าม deploy** (ไม่ commit)
  python3 build.py --bundle  → build/demo_bundle.html  รุ่นสาธิตไฟล์เดียว สำหรับ publish เป็น artifact ส่วนตัวให้บอสลองเล่น
ต้องรัน python3 bank/build.py ก่อนเมื่อใช้ --demo หรือ --bundle"""
import os, re, sys, json, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB, ENG = os.path.join(ROOT, 'web'), os.path.join(ROOT, 'engine')
ENGINE_FILES = ('engine.mjs', 'assemble.mjs', 'grade.mjs', 'pricing.mjs')

def demo_data():
    items = json.load(open(os.path.join(ROOT, 'build', 'items.json'), encoding='utf-8'))
    course = json.load(open(os.path.join(ROOT, 'build', 'course_cefr_b1.json'), encoding='utf-8'))
    cfg = json.load(open(os.path.join(ENG, 'config.json'), encoding='utf-8'))
    return 'globalThis.DEMO_DATA=' + json.dumps({'config': cfg, 'course': course, 'items': {i['id']: i for i in items}}, ensure_ascii=False) + ';'

def site(out, demo):
    if os.path.exists(out): shutil.rmtree(out)
    shutil.copytree(WEB, out)
    os.makedirs(os.path.join(out, 'js', 'engine'), exist_ok=True)
    for f in ENGINE_FILES: shutil.copyfile(os.path.join(ENG, f), os.path.join(out, 'js', 'engine', f))
    p = os.path.join(out, 'app.html'); html = open(p, encoding='utf-8').read()
    if demo:
        open(os.path.join(out, 'js', 'demo_data.js'), 'w', encoding='utf-8').write(demo_data())
        html = html.replace('<!--DEMO_DATA-->', '<script src="js/demo_data.js"></script>')
    else:
        html = html.replace('<!--DEMO_DATA-->\n', '')
    open(p, 'w', encoding='utf-8').write(html)
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
    html = ('<title>CEFR for Kru ทดลองเรียน</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400&display=swap">\n'
            '<style>\n' + css + '\n</style>\n<div class="wrap" id="app"></div>\n<script>' + demo_data().replace('</', '<\\/') + '</script>\n<script type="module">\n' + bundle_js().replace('</script', '<\\/script') + '\n</script>\n')
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    p = os.path.join(ROOT, 'build', 'demo_bundle.html'); open(p, 'w', encoding='utf-8').write(html)
    print(f'build/demo_bundle.html {len(html)//1024} KB (มีเฉลย เผยแพร่ได้เฉพาะแบบส่วนตัว)')

if __name__ == '__main__':
    if '--bundle' in sys.argv: bundle()
    elif '--demo' in sys.argv: site(os.path.join(ROOT, 'dist-demo'), True)
    else: site(os.path.join(ROOT, 'dist'), False)
