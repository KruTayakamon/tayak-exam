// ตัวประกอบเซสชัน: จากตัวชี้ความคืบหน้า + ไฟล์สัปดาห์ + สถานะข้อ → รายการขั้นที่หน้าเว็บเล่น · ฟังก์ชันล้วน
// สเปก: docs/cefr/03_learning_engine.md ข้อ 3 · เทสต์: tests/test_assemble.mjs
import { pickReview, gapMode } from './engine.mjs';

const idsOf = (s) => [...(s.check || []), ...(s.practice || [])];

/** ตัวชี้เริ่มต้นของคอร์ส */
export const startPointer = () => ({ week: 1, day: 1, part: 'a', done: false });

/**
 * ประกอบเซสชัน
 * kind: 'full' | 'short' · pointer {week, day, part} · week = เนื้อหาไฟล์ course/.../wNN (object)
 * states = {itemId: สถานะ SRS} · day = เลขวัน · lastDay = เลขวันล่าสุดที่เรียน · pace = 10|20|40
 * oldPool = [itemId] ข้อสำรองของสัปดาห์ก่อน ๆ ที่ผู้เรียนยังไม่เคยเจอ (เซิร์ฟเวอร์คัดมาให้)
 * คืน { kind, mode, steps:[{step, ...}], reviewIds, advance } · advance = จะขยับตัวชี้หรือไม่เมื่อทำจบ
 */
export function buildSession({ kind, pointer, week, states, day, lastDay, pace, oldPool = [], cfg }) {
  const mode = gapMode(lastDay, day, cfg);
  const sess = week.sessions.find((s) => s.day === pointer.day);
  if (!sess) throw new Error('ไม่มีเซสชันของวันนี้ในไฟล์สัปดาห์');
  const today = idsOf(sess);
  const cap = kind === 'short' ? cfg.review.cap_short : mode === 'comeback' ? cfg.review.cap_comeback : cfg.review.cap_session;
  let review = pickReview(states, day, cap, today);
  if (kind === 'full' && week.week >= 2 && review.length < cap) {      // สลับหัวข้อ: เติมข้อใหม่จากสัปดาห์ก่อน ๆ
    const add = oldPool.filter((id) => !states[id] && !today.includes(id) && !review.includes(id)).slice(0, Math.min(cfg.review.new_old_items, cap - review.length));
    review = review.concat(add);
  }
  const stepReview = { step: 'review', ids: review };
  if (kind === 'short') return { kind, mode, steps: [stepReview], reviewIds: review, advance: false };
  if (sess.type === 'mock') return { kind, mode, steps: [{ step: 'mock', mock: sess.mock }], reviewIds: [], advance: true };
  const steps = [];
  const half = pace === 10;                                             // จังหวะเบา: วันแรกขั้น 1–2 วันถัดไปขั้น 3–5
  const partA = !half || pointer.part === 'a', partB = !half || pointer.part === 'b';
  if (partA) steps.push(stepReview);
  if (sess.type === 'lab') {
    if (partA) steps.push({ step: 'lab_prepare', lab: sess.lab });
    if (partB) steps.push({ step: 'lab_do', lab: sess.lab }, { step: 'practice', ids: sess.practice || [] }, { step: 'close' });
  } else {
    if (partA) steps.push({ step: 'learn', lesson: sess.lesson, check: sess.check || [], day: sess.day, title: sess.title_th });   // day/title ใช้เลือกโทนสีของบทเรียน
    if (partB) steps.push({ step: 'practice', ids: sess.practice || [] }, { step: 'use', use: sess.use }, { step: 'close', classroom: sess.classroom });
  }
  return { kind, mode, steps, reviewIds: partA ? review : [], advance: true };
}

/** ขยับตัวชี้หลังทำเซสชันเต็มจบ · weeksTotal = 12 · จังหวะเบาขยับครึ่งเซสชัน */
export function advancePointer(pointer, pace, weeksTotal = 12, daysPerWeek = 6) {
  if (pointer.done) return pointer;
  if (pace === 10 && pointer.part === 'a' && pointer.day !== daysPerWeek) return { ...pointer, part: 'b' };   // ชุดย่อยวันที่ 6 ไม่แบ่งครึ่ง
  if (pointer.day < daysPerWeek) return { ...pointer, day: pointer.day + 1, part: 'a' };
  if (pointer.week < weeksTotal) return { week: pointer.week + 1, day: 1, part: 'a', done: false };
  return { ...pointer, done: true };
}

/** จำนวนเซสชันเต็มที่เหลือ (ใช้คำนวณวันจบ) */
export function remainingSessions(pointer, weeksTotal = 12, daysPerWeek = 6) {
  if (pointer.done) return 0;
  return (weeksTotal - pointer.week) * daysPerWeek + (daysPerWeek - pointer.day + 1) - (pointer.part === 'b' ? 0.5 : 0);
}

/** เลือกข้อของชุดย่อยจับเวลาจากข้อสำรอง · pool = [{id, skill, points, week}] · rng = ฟังก์ชันสุ่ม 0..1 (เซิร์ฟเวอร์ใช้ seed ต่อผู้ใช้) */
export function pickMock(pool, blueprint, seen, rng) {
  const out = [], short = {};
  for (const [skill, need] of Object.entries(blueprint)) {
    const cand = pool.filter((p) => p.skill === skill).map((p) => ({ p, k: (seen.has(p.id) ? 1 : 0) + rng() * 0.999 })).sort((a, b) => a.k - b.k).map((x) => x.p);
    let got = 0;
    for (const c of cand) { if (got + c.points > need) continue; out.push(c.id); got += c.points; if (got === need) break; }
    if (got < need) short[skill] = need - got;
  }
  return { ids: out, short };
}
