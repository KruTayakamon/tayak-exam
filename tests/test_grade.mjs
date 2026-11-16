// เทสต์ตัวตรวจคำตอบ · รัน: node tests/test_grade.mjs
import { grade, near, strip, pointsOf } from '../engine/grade.mjs';
let fails = 0;
const eq = (a, b, name) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`)); if (!ok) fails++; };
const mcq = { id: 'x', kind: 'mcq', skill: 'gm', stem: 's', choices: [{ t: 'a', why: 'w1' }, { t: 'b', why: 'w2' }], answer: 1 };
eq([grade(mcq, 0, 1), grade(mcq, 0, '1'), grade(mcq, 0, 0), grade(mcq, 0, undefined)], [true, true, false, false], 'เลือกตอบ');
const ty = { kind: 'type', answer: 'currently', accept: ['currently'] };
eq([grade(ty, 0, ' Currently '), grade(ty, 0, 'curently'), grade(ty, 0, 'currentlyy'), grade(ty, 0, 'curently y'), grade(ty, 0, 'recently'), grade(ty, 0, '')], [true, true, true, false, false, false], 'พิมพ์คำ: ไม่สนตัวพิมพ์และช่องว่าง ยอมผิด 1 ตัว');
eq([near('for', 'fur'), near('cat', 'cat')], [false, true], 'คำสั้นกว่า 4 ตัวต้องตรงทั้งคำ');
const od = { kind: 'order', chunks: ['I', 'teach', 'English'] };
eq([grade(od, 0, ['I', 'teach', 'English']), grade(od, 0, ['teach', 'I', 'English']), grade(od, 0, 'x')], [true, false, false], 'เรียงประโยค');
const rd = { id: 'r', kind: 'read', skill: 'rd', passage: 'p', questions: [{ stem: 'q1', choices: [{ t: 'a', why: 'w' }], answer: 0 }, { stem: 'q2', choices: [{ t: 'a', why: 'w' }, { t: 'b', why: 'w' }], answer: 1 }] };
eq([grade(rd, 0, 0), grade(rd, 1, 0), grade(rd, 1, 1), grade(rd, 5, 0), grade(rd, 0, null), pointsOf(rd), pointsOf(mcq)], [true, false, true, false, false, 2, 1], 'ชุดคำถาม: ตรวจรายคำถามย่อย และคำตอบว่างไม่ถือว่าถูก');
const s = strip(rd), s2 = strip(mcq), s3 = strip({ ...od, id: 'o', skill: 'gm' }, (a) => [...a].reverse());
eq([JSON.stringify(s).includes('why'), JSON.stringify(s).includes('answer'), JSON.stringify(s2).includes('why'), 'answer' in s2, s3.chunks], [false, false, false, false, ['English', 'teach', 'I']], 'ตัดเฉลยและเหตุผลออกหมด และสลับชิ้นของข้อเรียงประโยค');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
