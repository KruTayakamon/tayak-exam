#!/usr/bin/env python3
"""เทสต์เครื่องมือโพสต์เพจ · รัน: python3 tests/test_posts.py"""
import os, sys, subprocess, tempfile, yaml
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = os.path.join(ROOT, 'marketing', 'posts', '_example.yaml')
fails = []
def ok(c, name): print(('PASS ' if c else 'FAIL ') + name); c or fails.append(name)
def run(path): return subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'make_posts.py'), '--check', path], capture_output=True, text=True)
r = run(EX); ok(r.returncode == 0, 'ตัวอย่างโพสต์ผ่านตัวตรวจ')
base = yaml.safe_load(open(EX, encoding='utf-8'))
def bad(mutate, expect, name):
    d = [dict(p) for p in base]; mutate(d)
    with tempfile.NamedTemporaryFile('w', suffix='.yaml', delete=False, encoding='utf-8') as f: yaml.safe_dump(d, f, allow_unicode=True)
    r = run(f.name); os.unlink(f.name)
    ok(r.returncode == 1 and expect in r.stdout, name)
bad(lambda d: d[0].update(caption='ไม่มีลิงก์'), '{link}', 'แคปชันไม่มีลิงก์ = ไม่ผ่าน')
bad(lambda d: d[0].update(caption='คำตอบคือ is having นะ {link}'), 'ห้ามเฉลย', 'แคปชันของ quiz มีคำตอบ = ไม่ผ่าน')
bad(lambda d: d[1].update(more=d[1]['more'][:2]), 'more 4–5', 'ชุดสั้นน้อยกว่า 4 ข้อ = ไม่ผ่าน')
bad(lambda d: d[2].update(caption='ฝึกต่อ #IELTS {link}'), 'คำต้องห้าม', 'ชื่อชุดทดสอบในแคปชัน = ไม่ผ่าน')
bad(lambda d: d[1].update(id='mk-quiz-0009'), 'ชนิดในรหัส', 'รหัสไม่ตรงชนิด = ไม่ผ่าน')
print('ALL PASS' if not fails else f'{len(fails)} FAILED'); sys.exit(1 if fails else 0)
