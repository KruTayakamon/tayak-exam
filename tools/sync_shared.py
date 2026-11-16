#!/usr/bin/env python3
"""คัดลอกโค้ดเครื่องยนต์ไปให้ Edge Functions · รัน: python3 tools/sync_shared.py
Supabase รวมไฟล์ได้เฉพาะใต้ supabase/functions/ จึงต้องมีสำเนาใน _shared/ · ต้นทางที่แก้ได้คือ engine/ เท่านั้น
tests/test_shared.py ตรวจว่าสำเนาตรงกับต้นทาง"""
import os, json, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DST = os.path.join(ROOT, 'engine'), os.path.join(ROOT, 'supabase', 'functions', '_shared')
os.makedirs(DST, exist_ok=True)
for f in ('engine.mjs', 'assemble.mjs', 'pricing.mjs'):
    shutil.copyfile(os.path.join(SRC, f), os.path.join(DST, f))
cfg = json.load(open(os.path.join(SRC, 'config.json'), encoding='utf-8'))
open(os.path.join(DST, 'config.mjs'), 'w', encoding='utf-8').write('// สร้างจาก engine/config.json ห้ามแก้ไฟล์นี้\nexport default ' + json.dumps(cfg, ensure_ascii=False, indent=2) + ';\n')
print('synced engine -> supabase/functions/_shared')
