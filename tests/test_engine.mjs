// เทสต์เครื่องยนต์การเรียน · รัน: node tests/test_engine.mjs (ต้อง ALL PASS)
import fs from 'node:fs';
import * as E from '../engine/engine.mjs';
const cfg = JSON.parse(fs.readFileSync(new URL('../engine/config.json', import.meta.url)));
let fails = 0;
const ok = (c, name) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name + (JSON.stringify(a) === JSON.stringify(b) ? '' : `  ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`));

// วัน: 16 พ.ย. 2026 02:59 เวลาไทย ยังเป็นวันที่ 15 · 03:00 เป็นวันที่ 16
const t = (s) => Date.parse(s);
eq(E.dayKey(E.dayNo(t('2026-11-15T19:59:00Z'), cfg)), '2026-11-15', 'ก่อนตีสามยังนับเป็นวันก่อน');
eq(E.dayKey(E.dayNo(t('2026-11-15T20:00:00Z'), cfg)), '2026-11-16', 'ตีสามเริ่มวันใหม่');
const mon = E.dayNo(t('2026-11-16T05:00:00Z'), cfg);          // จันทร์ 16 พ.ย. 2026
eq(E.weekStart(mon), mon, 'วันจันทร์เป็นต้นสัปดาห์'); eq(E.weekStart(mon + 6), mon, 'วันอาทิตย์อยู่สัปดาห์เดียวกัน'); eq(E.weekStart(mon + 7), mon + 7, 'จันทร์ถัดไปเป็นสัปดาห์ใหม่');

// SRS
let s = E.srsUpdate(null, false, 100, cfg);
eq([s.box, s.due, s.wrong], [1, 101, 1], 'ผิดครั้งแรก กลับมาพรุ่งนี้');
s = E.srsUpdate(s, true, 101, cfg); eq([s.box, s.due, s.mastered], [2, 104, false], 'ถูกเมื่อถึงกำหนด เลื่อนเป็น 3 วัน');
s = E.srsUpdate(s, true, 104, cfg); eq([s.box, s.due, s.mastered], [3, 111, true], 'ถูกสองครั้งแบบเว้นระยะ = ได้แล้ว');
const early = E.srsUpdate(s, true, 105, cfg); eq([early.box, early.due], [3, 111], 'ถูกก่อนถึงกำหนด ไม่เลื่อนขั้น');
s = E.srsUpdate(s, false, 111, cfg); eq([s.box, s.due, s.lapses, s.mastered], [1, 112, 1, false], 'ผิดหลังเคยผ่าน = หลุด กลับไปเริ่มใหม่');
let p = E.srsUpdate(null, true, 100, cfg); eq([p.probe, p.due], [true, 114], 'ถูกตั้งแต่ครั้งแรก ตรวจซ้ำที่ 14 วัน');
p = E.srsUpdate(p, true, 114, cfg); eq([p.mastered, p.due], [true, 204], 'ตรวจซ้ำผ่าน = ได้แล้ว ทวนอีกที 90 วัน');
let q = E.srsUpdate(null, true, 100, cfg); q = E.srsUpdate(q, false, 114, cfg); eq([q.box, q.lapses], [1, 1], 'ตรวจซ้ำไม่ผ่าน นับเป็นหลุด');
let l = E.srsUpdate(null, false, 1, cfg); for (const d of [2, 5]) l = E.srsUpdate(l, true, d, cfg);
for (let i = 0; i < 3; i++) { l = E.srsUpdate(l, false, 20 + i * 10, cfg); l = E.srsUpdate(l, true, 21 + i * 10, cfg); }
ok(E.isLeech(l, cfg), 'หลุด 3 ครั้ง = ข้อที่ต้องกลับไปอ่านบทเรียน');

// เลือกข้อทบทวน
const st = { a: { due: 10, lapses: 0 }, b: { due: 8, lapses: 0 }, c: { due: 8, lapses: 2 }, d: { due: 30, lapses: 0 }, e: { due: 9, lapses: 0 } };
eq(E.pickReview(st, 10, 3), ['c', 'b', 'e'], 'เลยกำหนดนานสุดก่อน แล้วหลุดบ่อยสุด และไม่เกินเพดาน');
eq(E.pickReview(st, 10, 8, ['c']), ['b', 'e', 'a'], 'ไม่เอาข้อที่อยู่ในเซสชันวันนี้ และไม่เอาข้อที่ยังไม่ถึงกำหนด');

// ช่วงที่หายไป และวันจบ
eq([E.gapMode(null, 50, cfg), E.gapMode(45, 50, cfg), E.gapMode(43, 50, cfg), E.gapMode(20, 50, cfg)], ['normal', 'normal', 'comeback', 'replace'], 'โหมดตามช่วงที่หายไป');
eq(E.projectFinish(72, 20, 0, cfg), 84, 'จังหวะมาตรฐาน 72 เซสชัน = 12 สัปดาห์');
eq(E.projectFinish(72, 10, 0, cfg), 168, 'จังหวะเบา = 24 สัปดาห์'); eq(E.projectFinish(72, 40, 0, cfg), 42, 'จังหวะเร่ง = 6 สัปดาห์');

// เป้ารายสัปดาห์
const days = [mon - 14, mon - 13, mon - 12, mon - 11, mon - 10, mon - 7, mon - 6, mon - 5, mon - 4, mon - 2, mon, mon + 1];
eq(E.weekProgress(days, mon + 1, cfg), { count: 2, goal: 5, met: false, streakWeeks: 2 }, 'สัปดาห์นี้ยังไม่ครบ สตรีคสองสัปดาห์ก่อนยังอยู่');
eq(E.weekProgress([...days, mon + 2, mon + 3, mon + 4], mon + 4, cfg).streakWeeks, 3, 'ครบ 5 วันแล้วสตรีคเพิ่ม');
eq(E.weekProgress([mon - 14, mon], mon, cfg).streakWeeks, 0, 'สัปดาห์ก่อนไม่ครบ สตรีคเป็นศูนย์');

// วัดระดับ (25 ข้อ: a2 6 · b1 8 · b2 7 · c1 4)
const pl = (a, b, c, d) => E.placementEstimate({ a2: [a, 6], b1: [b, 8], b2: [c, 7], c1: [d, 4] }, cfg);
eq([pl(5, 4, 2, 0).level, pl(5, 4, 2, 0).position, pl(5, 4, 2, 0).plan], ['a2', 'high', ['b1']], 'ผ่าน A2 และทำ B1 ได้ครึ่งหนึ่ง = ช่วงบนของ A2 เรียน b1');
eq([pl(4, 2, 1, 0).position, pl(4, 2, 1, 0).plan], ['low', ['a2', 'b1']], 'ผ่าน A2 แบบไม่แน่น และ B1 ต่ำ = ปูพื้นก่อน');
eq([pl(6, 2, 1, 0).plan, pl(6, 2, 1, 0).rounds], [['b1'], 2], 'A2 แน่น แต่ B1 ต่ำ = เรียน b1 สองรอบ');
eq([pl(2, 1, 0, 0).level, pl(2, 1, 0, 0).plan, pl(2, 1, 0, 0).rounds], ['below-a2', ['a2'], 2], 'ต่ำกว่า A2 มาก');
eq([pl(6, 7, 5, 2).level, pl(6, 7, 5, 2).plan], ['b2', ['c1']], 'ผ่านถึง B2 และทำ C1 ได้ครึ่งหนึ่ง');
eq(pl(6, 7, 5, 1).plan, ['b2', 'c1'], 'ผ่าน B2 แบบไม่แน่น และ C1 ต่ำ = ทวน b2 ก่อน');
eq([pl(6, 4, 0, 0).borderline, pl(6, 5, 0, 0).borderline, pl(6, 7, 0, 0).borderline, pl(6, 2, 0, 0).borderline], [true, true, false, false], 'ก้ำกึ่งเมื่อขาดหรือเกินขั้นต่ำเพียง 1 ข้อ');
eq(pl(6, 8, 7, 3).position, 'top', 'ผ่านทุกระดับ');
eq(pl(3, 8, 7, 4).level, 'below-a2', 'ต้องผ่านตามลำดับ ระดับล่างไม่ผ่านไม่นับระดับบน');

// ความพร้อม
eq(E.readiness(null, { correct: 5, n: 10 }, cfg).state, 'insufficient', 'ข้อมูลน้อยไป ไม่แสดงผล');
eq(E.readiness({ correct: 14, n: 20 }, { correct: 21, n: 30 }, cfg), { state: 'in_target', value: 70, n: 50 }, 'ถ่วงน้ำหนักชุดวัดผล 60 แบบฝึก 40');
eq(E.readiness({ correct: 10, n: 20 }, { correct: 21, n: 30 }, cfg).state, 'near', 'ใกล้เป้า');
eq(E.readiness(null, { correct: 10, n: 25 }, cfg).state, 'far', 'ยังไม่มีชุดวัดผล ใช้แบบฝึกอย่างเดียว');

// เซสชันซ่อม และข้อรับรองความคุ้มค่า
eq(E.remedialTopic([{ topic: 'x', correct: 1, n: 2 }, { topic: 'y', correct: 2, n: 5 }, { topic: 'z', correct: 1, n: 4 }], cfg), 'z', 'ซ่อมหัวข้อที่ต่ำสุดซึ่งมีข้อมูลพอ');
eq(E.remedialTopic([{ topic: 'y', correct: 3, n: 5 }], cfg), null, 'ถึง 60% ไม่ต้องซ่อม');
ok(E.guaranteeEligible({ fullSessions: 48, totalSessions: 60, checkpointsDone: 3, finalCheckpointPct: 62 }, cfg), 'ครบเงื่อนไข ได้ต่อเวลา');
ok(!E.guaranteeEligible({ fullSessions: 47, totalSessions: 60, checkpointsDone: 3, finalCheckpointPct: 62 }, cfg), 'เรียนไม่ถึง 80% ไม่ได้');
ok(!E.guaranteeEligible({ fullSessions: 60, totalSessions: 60, checkpointsDone: 3, finalCheckpointPct: 74 }, cfg), 'ถึงเป้าแล้ว ไม่ต้องต่อ');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
