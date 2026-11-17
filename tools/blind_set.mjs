// ชุดตรวจข้ามแบบไม่เห็นเฉลย (docs/writing/qa.md ด่านที่ 3) · รันหลัง python3 bank/build.py
//   node tools/blind_set.mjs b1 1                → build/blind_b1_w01.json (ไม่มีเฉลย ไม่มีเหตุผล) ส่งให้ผู้ตรวจ
//   node tools/blind_set.mjs pl 0                → แบบวัดระดับ
//   node tools/blind_set.mjs b1 1 answers.json   → เทียบคำตอบของผู้ตรวจกับเฉลย พิมพ์ข้อที่ต่าง (exit 1 ถ้ามี)
// รูปแบบคำตอบ: { "<รหัสข้อ>": [คำตอบของคำถามย่อยแต่ละข้อ] } · ข้อเลือกตอบใช้เลข 1–4 ตามลำดับที่เห็น ·
// ข้อพิมพ์ใช้ข้อความ · ข้อเรียงใช้รายการชิ้นตามลำดับ · ตอบไม่ได้ให้ใส่ null และเขียนเหตุผลใน "_notes": {"<รหัสข้อ>": "..."}
import { readFileSync, writeFileSync } from 'node:fs';
import { grade, pointsOf, strip } from '../engine/grade.mjs';
const [course, wk, ansPath] = process.argv.slice(2);
if (!course || !wk) { console.log('ใช้: node tools/blind_set.mjs <คอร์ส> <สัปดาห์> [answers.json]'); process.exit(2); }
const root = new URL('..', import.meta.url).pathname;
const prefix = course === 'pl' ? 'cefr-pl-' : `cefr-${course}-w${String(wk).padStart(2, '0')}-`;   // แบบวัดระดับ: node tools/blind_set.mjs pl 0
const items = JSON.parse(readFileSync(root + 'build/items.json', 'utf8')).filter((i) => i.id.startsWith(prefix));
if (!items.length) { console.log('ไม่พบข้อของ ' + prefix + ' (รัน python3 bank/build.py ก่อน)'); process.exit(2); }
const out = `${root}build/blind_${course}_w${String(wk).padStart(2, '0')}.json`;
if (!ansPath) {
  const rev = (a) => [...a].reverse();   // สลับชิ้นของข้อเรียงแบบคงที่ (ผู้ตรวจต้องเรียงเอง)
  writeFileSync(out, JSON.stringify(items.map((i) => strip(i, rev)), null, 1));
  console.log(`${items.length} ข้อ → ${out}`); process.exit(0);
}
const ans = JSON.parse(readFileSync(ansPath, 'utf8'));
let diff = 0, n = 0, skipped = 0;
for (const it of items) {
  const a = ans[it.id];
  for (let q = 0; q < pointsOf(it); q++) {
    n++;
    let v = Array.isArray(a) && it.kind !== 'order' ? a[q] : it.kind === 'order' ? (Array.isArray(a?.[0]) ? a[0] : a) : a;
    if (v === null || v === undefined) { skipped++; console.log(`ไม่ตอบ   ${it.id} #${q + 1}  ${ans._notes?.[it.id] ?? ''}`); continue; }
    if (it.kind === 'mcq' || it.questions) v = Number(v) - 1;
    if (!grade(it, q, v)) { diff++; console.log(`ต่างเฉลย ${it.id} #${q + 1}  ผู้ตรวจตอบ ${JSON.stringify(Array.isArray(a) ? a[q] : a)}  ${ans._notes?.[it.id] ?? ''}`); }
  }
}
console.log(`\n${n} คำถาม · ต่างเฉลย ${diff} · ไม่ตอบ ${skipped} → ทุกข้อที่ขึ้นข้างบนต้องให้ผู้เขียนดูซ้ำ`);
process.exit(diff || skipped ? 1 : 0);
