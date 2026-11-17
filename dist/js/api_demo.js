// โหมดสาธิต: "เซิร์ฟเวอร์จำลอง" ในเบราว์เซอร์ ใช้เครื่องยนต์ตัวเดียวกับของจริง เก็บสถานะใน localStorage
// ใช้ทดสอบและให้บอสลองเล่นโดยไม่ต้องมีฐานข้อมูล · ข้อมูลเนื้อหา (มีเฉลย) มาจาก DEMO_DATA ที่ build ใส่ให้เฉพาะ dist-demo/ ห้าม deploy
// พฤติกรรมต้องตรงกับ supabase/functions/exam-api (สัญญาเดียวกัน) เพื่อให้หน้าเว็บสลับไปของจริงได้โดยไม่แก้
import { dayNo, srsUpdate, weekProgress, weekStart, projectFinish, readiness, placementEstimate } from './engine/engine.mjs';
import { buildSession, advancePointer, remainingSessions, startPointer } from './engine/assemble.mjs';
import { grade, strip } from './engine/grade.mjs';
import { quote, PRODUCTS } from './engine/pricing.mjs';
import { load, save, drop } from './store.js';

const KEY = 'cfk-demo';
const fresh = () => ({ enrol: null, states: {}, events: [], sessions: [], offset: 0 });
const st = () => load(KEY, fresh());
const put = (s) => save(KEY, s);
const cfgOf = () => globalThis.DEMO_DATA.config;
const nowMs = (s) => Date.now() + (s.offset || 0) * 86400000;
const today = (s) => dayNo(nowMs(s), cfgOf());
const weekOf = (n) => globalThis.DEMO_DATA.course.weeks.find((w) => w.week === n) || null;
const itemOf = (id) => globalThis.DEMO_DATA.items[id];

export const demoApi = {
  mode: 'demo',
  // แบบวัดระดับ (ไม่ต้องล็อกอิน) · ส่งข้อแบบตัดเฉลยเหมือนเซิร์ฟเวอร์จริง และตรวจด้วยตัวตรวจตัวเดียวกัน
  async placementItems() {
    const its = Object.values(globalThis.DEMO_DATA.items).filter((i) => /^cefr-pl-\d{4}$/.test(i.id)).sort((a, b) => a.id.localeCompare(b.id));
    return { items: its.map((i) => ({ ...strip(i, (a) => a), band: i.band })), time_min: 20 };
  },
  async placementGrade(answers) {
    const scores = { a2: [0, 0], b1: [0, 0], b2: [0, 0], c1: [0, 0] }, bySkill = {};
    for (const it of Object.values(globalThis.DEMO_DATA.items).filter((i) => /^cefr-pl-\d{4}$/.test(i.id))) {
      const qs = it.questions ? it.questions.length : 1;
      for (let q = 0; q < qs; q++) {
        const ok = grade(it, q, answers[qs > 1 ? `${it.id}:${q}` : it.id]);
        if (scores[it.band]) { scores[it.band][1]++; if (ok) scores[it.band][0]++; }
        (bySkill[it.skill] ||= [0, 0])[1]++; if (ok) bySkill[it.skill][0]++;
      }
    }
    return { result: { ...placementEstimate(scores, cfgOf()), scores, by_skill: bySkill } };
  },
  async status() {
    const now = Date.now();
    return { entitlements: [{ product: 'cefr-b1', expires_at: now + 180 * 86400000 }], prices: Object.keys(PRODUCTS).map((p) => quote(p, now)), orders: [] };
  },
  async enrol({ pace = 20, target_date = null, slot = null } = {}) {
    const s = st();
    s.enrol = { ...(s.enrol || { ...startPointer(), last_day: null }), pace, target_date, slot };
    put(s); return { ok: true };
  },
  async home() {
    const s = st();
    if (!s.enrol) return { error: 'not_enrolled' };
    const d = today(s), en = s.enrol, pointer = { week: en.week, day: en.day, part: en.part, done: en.done };
    const days = [...new Set(s.sessions.map((x) => x.day_no))];
    const w0 = weekStart(d);
    const wk = weekOf(pointer.week), sess = wk && wk.sessions.find((x) => x.day === pointer.day);
    const prac = {};
    for (const e of s.events) {
      if (!e.first || e.day_no < d - 14 || !['check', 'practice', 'mock'].includes(e.mode)) continue;
      const k = itemOf(e.item).skill; (prac[k] ||= { correct: 0, n: 0 }).n++; if (e.correct) prac[k].correct++;
    }
    const ready = {}; for (const k of Object.keys(prac)) ready[k] = readiness(null, prac[k], cfgOf());
    return {
      pointer, pace: en.pace, day: d, due: Object.values(s.states).filter((x) => x.due <= d).length,
      week: { ...weekProgress(days, d, cfgOf()), days: [0, 1, 2, 3, 4, 5, 6].map((i) => days.includes(w0 + i)), todayIndex: d - w0 },
      readiness: ready, checkpoints: [], finish_day: projectFinish(remainingSessions(pointer), en.pace, d, cfgOf()),
      full_sessions: s.sessions.filter((x) => x.kind === 'full').length,
      minutes: s.sessions.reduce((a, x) => a + (x.minutes || 0), 0),
      title: sess ? sess.title_th : null, theme: wk ? wk.theme_th : null, session_minutes: sess ? sess.minutes : 20,
      content_missing: !wk, done_today: s.sessions.some((x) => x.day_no === d && x.kind !== 'short'),
    };
  },
  async session({ kind = 'full' } = {}) {
    const s = st(), en = s.enrol;
    if (!en) return { error: 'not_enrolled' };
    const d = today(s), pointer = { week: en.week, day: en.day, part: en.part, done: en.done };
    const wk = weekOf(pointer.week);
    if (!wk) return { error: 'content_missing' };
    const plan = buildSession({ kind, pointer, week: wk, states: s.states, day: d, lastDay: en.last_day, pace: en.pace, oldPool: [], cfg: cfgOf() });
    const need = new Set();
    for (const x of plan.steps) { for (const id of x.ids || []) need.add(id); for (const id of x.check || []) need.add(id); }
    return { plan, items: Object.fromEntries([...need].map((id) => [id, itemOf(id)])), day: d, pointer };
  },
  async sync({ events = [], completed = null } = {}) {
    const s = st(), d = today(s), graded = [];
    const seen = new Set(s.events.map((e) => e.eid)), answered = new Set(s.events.map((e) => `${e.item}:${e.q}`));
    for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
      const it = itemOf(e.item);
      if (!it || seen.has(e.eid)) continue;
      seen.add(e.eid);
      const q = e.q || 0, ok = grade(it, q, e.answer), key = `${e.item}:${q}`;
      s.events.push({ eid: e.eid, item: e.item, q, correct: ok, first: !answered.has(key), mode: e.mode, day_no: d });
      answered.add(key);
      if (!it.questions) s.states[e.item] = srsUpdate(s.states[e.item] || null, ok, d, cfgOf());
      graded.push({ eid: e.eid, correct: ok });
    }
    let pointer = { week: s.enrol.week, day: s.enrol.day, part: s.enrol.part, done: s.enrol.done };
    if (completed) {
      s.sessions.push({ kind: completed.kind, day_no: d, minutes: Math.min(completed.minutes || 0, 120), week: pointer.week, day: pointer.day });
      if (completed.kind === 'full' || completed.kind === 'mock') pointer = advancePointer(pointer, s.enrol.pace);
      Object.assign(s.enrol, pointer, { last_day: d });
    }
    put(s); return { accepted: graded.length, pointer, graded };
  },
  async report({ item_id, why }) { const s = st(); (s.reports ||= []).push({ item_id, why, at: Date.now() }); put(s); return { ok: true }; },
  // เฉพาะโหมดสาธิต: เลื่อนวัน และล้างข้อมูล
  demoShiftDay(n) { const s = st(); s.offset = (s.offset || 0) + n; put(s); return s.offset; },
  demoReset() { drop(KEY); },
  demoState() { return st(); },
};
