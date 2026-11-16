// เทสต์ตัวประกอบเซสชันกับเนื้อหาสัปดาห์ 1 ของ b1 · รัน: python3 bank/build.py && node tests/test_assemble.mjs
import fs from 'node:fs';
import * as A from '../engine/assemble.mjs';
const cfg = JSON.parse(fs.readFileSync(new URL('../engine/config.json', import.meta.url)));
const course = JSON.parse(fs.readFileSync(new URL('../build/course_cefr_b1.json', import.meta.url)));
const w1 = course.weeks[0];
let fails = 0;
const eq = (a, b, name) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`)); if (!ok) fails++; };
const base = { week: w1, states: {}, day: 100, lastDay: 99, pace: 20, cfg };
let s = A.buildSession({ ...base, kind: 'full', pointer: A.startPointer() });
eq(s.steps.map((x) => x.step), ['review', 'learn', 'practice', 'use', 'close'], 'เซสชันเต็มมี 5 ขั้นตามลำดับ');
eq([s.steps[0].ids.length, s.steps[1].check.length, s.steps[2].ids.length], [0, 2, 10], 'วันแรกยังไม่มีข้อทบทวน มีข้อเช็ก 2 และข้อฝึก 10');
const states = { 'cefr-b1-w01-001': { due: 99, lapses: 0 }, 'cefr-b1-w01-013': { due: 100, lapses: 1 }, 'cefr-b1-w01-014': { due: 120, lapses: 0 } };
s = A.buildSession({ ...base, kind: 'full', pointer: { week: 1, day: 2, part: 'a' }, states });
eq(s.steps[0].ids, ['cefr-b1-w01-001'], 'ทบทวนเฉพาะข้อที่ถึงกำหนด และไม่เอาข้อที่อยู่ในบทเรียนวันนี้');
s = A.buildSession({ ...base, kind: 'short', pointer: { week: 1, day: 3, part: 'a' }, states });
eq([s.steps.map((x) => x.step), s.advance, s.steps[0].ids], [['review'], false, ['cefr-b1-w01-001', 'cefr-b1-w01-013']], 'เซสชันสั้นมีแต่ทบทวน และไม่ขยับตัวชี้');
s = A.buildSession({ ...base, kind: 'full', pointer: { week: 1, day: 5, part: 'a' } });
eq(s.steps.map((x) => x.step), ['review', 'lab_prepare', 'lab_do', 'practice', 'close'], 'วันห้องฝึก');
s = A.buildSession({ ...base, kind: 'full', pointer: { week: 1, day: 6, part: 'a' } });
eq([s.steps[0].step, s.steps[0].mock.items], ['mock', 20], 'วันที่ 6 เป็นชุดย่อย');
const a = A.buildSession({ ...base, kind: 'full', pace: 10, pointer: { week: 1, day: 1, part: 'a' } }), b = A.buildSession({ ...base, kind: 'full', pace: 10, pointer: { week: 1, day: 1, part: 'b' } });
eq([a.steps.map((x) => x.step), b.steps.map((x) => x.step)], [['review', 'learn'], ['practice', 'use', 'close']], 'จังหวะเบาแบ่งเซสชันเป็นสองวัน');
eq(A.buildSession({ ...base, kind: 'full', lastDay: 90, pointer: A.startPointer() }).mode, 'comeback', 'หายไป 10 วัน เข้าโหมดกลับมาใหม่');
const w2 = { ...w1, week: 2 };
s = A.buildSession({ ...base, week: w2, kind: 'full', pointer: { week: 2, day: 1, part: 'a' }, oldPool: ['old-1', 'old-2', 'old-3'] });
eq(s.steps[0].ids, ['old-1', 'old-2'], 'ตั้งแต่สัปดาห์ 2 เติมข้อใหม่จากสัปดาห์ก่อนได้ไม่เกิน 2 ข้อ');
// ตัวชี้
let p = A.startPointer(); for (let i = 0; i < 6; i++) p = A.advancePointer(p, 20);
eq(p, { week: 2, day: 1, part: 'a', done: false }, 'ครบ 6 เซสชันขึ้นสัปดาห์ใหม่');
p = A.startPointer(); let n = 0; while (!p.done && n < 500) { p = A.advancePointer(p, 20); n++; }
eq(n, 72, 'คอร์สมี 72 เซสชันที่จังหวะมาตรฐาน');
p = A.startPointer(); n = 0; while (!p.done && n < 500) { p = A.advancePointer(p, 10); n++; }
eq(n, 132, 'จังหวะเบา: 60 เซสชันแบ่งครึ่ง + 12 ชุดย่อย = 132 วันเรียน');
eq([A.remainingSessions(A.startPointer()), A.remainingSessions({ week: 12, day: 6, part: 'a' }), A.remainingSessions({ week: 1, day: 1, part: 'b' })], [72, 1, 71.5], 'เซสชันที่เหลือ');
// ชุดย่อย
const pool = [{ id: 'g1', skill: 'gm', points: 1 }, { id: 'g2', skill: 'gm', points: 1 }, { id: 'g3', skill: 'gm', points: 1 }, { id: 'r1', skill: 'rd', points: 4 }, { id: 'r2', skill: 'rd', points: 2 }];
let m = A.pickMock(pool, { gm: 2, rd: 2 }, new Set(['g1']), () => 0.5);
eq([m.ids, m.short], [['g2', 'g3', 'r2'], {}], 'ชุดย่อยเลือกข้อที่ยังไม่เคยเจอก่อน และไม่เกินคะแนนของทักษะ');
m = A.pickMock(pool, { gm: 4 }, new Set(), () => 0.5);
eq(m.short, { gm: 1 }, 'ข้อสำรองไม่พอ ต้องรายงานจำนวนที่ขาด');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
