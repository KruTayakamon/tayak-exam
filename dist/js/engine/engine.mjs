// เครื่องยนต์การเรียน: ฟังก์ชันล้วน ไม่มี I/O · ใช้ไฟล์เดียวกันทั้งในเบราว์เซอร์ Edge Function (Deno) และ Node
// สเปกและเหตุผลอยู่ใน docs/cefr/03_learning_engine.md · เทสต์ tests/test_engine.mjs คือคำนิยามของพฤติกรรม
// "วัน" ทุกที่เป็นเลขจำนวนเต็ม (dayNo) นับจาก 1970-01-01 ตามเวลาไทย โดยวันใหม่เริ่ม 03:00 น.

const DAY = 86400000;

/** เวลา (ms) → เลขวันตามเวลาไทย วันใหม่เริ่ม day_starts_at_hour */
export function dayNo(ts, cfg) {
  return Math.floor((ts + (cfg.tz_offset_hours - cfg.day_starts_at_hour) * 3600000) / DAY);
}
export const dayKey = (d) => new Date(d * DAY).toISOString().slice(0, 10);
/** เลขวันของวันจันทร์ในสัปดาห์เดียวกัน (1970-01-01 เป็นวันพฤหัสบดี) */
export const weekStart = (d) => d - ((d + 3) % 7);

/** อัปเดตสถานะของข้อหนึ่งข้อหลังตอบ · st = null เมื่อเจอครั้งแรก */
export function srsUpdate(st, correct, day, cfg) {
  const c = cfg.srs;
  if (!st) {
    return correct
      ? { box: 0, probe: true, due: day + c.probe_days, seen: 1, wrong: 0, lapses: 0, last: day, mastered: false }
      : { box: 1, probe: false, due: day + c.intervals[0], seen: 1, wrong: 1, lapses: 0, last: day, mastered: false };
  }
  const n = { ...st, seen: st.seen + 1, last: day };
  if (!correct) {
    n.wrong = st.wrong + 1;
    if (st.box > 1 || st.probe || st.mastered) n.lapses = st.lapses + 1;   // เคยผ่านแล้วกลับมาผิด = หลุด
    n.box = 1; n.probe = false; n.mastered = false; n.due = day + c.intervals[0];
    return n;
  }
  if (day < st.due) return n;                       // ตอบถูกก่อนถึงกำหนด: ไม่เลื่อนขั้น (กันการปั๊ม)
  if (st.probe) { n.probe = false; n.box = c.intervals.length; n.mastered = true; n.due = day + c.maintain_days; return n; }
  n.box = Math.min(st.box + 1, c.intervals.length);
  n.mastered = n.box >= c.mastered_box;
  n.due = day + (st.box >= c.intervals.length ? c.maintain_days : c.intervals[n.box - 1]);
  return n;
}
export const isLeech = (st, cfg) => !!st && st.lapses >= cfg.srs.leech_lapses;

/** เลือกข้อทบทวน: ถึงกำหนดแล้ว ไม่ซ้ำกับข้อของวันนี้ · เรียง เลยกำหนดนานสุดก่อน แล้วหลุดบ่อยสุด แล้ว id */
export function pickReview(states, day, cap, excludeIds = []) {
  const ex = new Set(excludeIds);
  return Object.entries(states)
    .filter(([id, s]) => s.due <= day && !ex.has(id))
    .sort((a, b) => (a[1].due - b[1].due) || (b[1].lapses - a[1].lapses) || (a[0] < b[0] ? -1 : 1))
    .slice(0, cap).map(([id]) => id);
}

/** โหมดของเซสชันตามช่วงที่หายไป */
export function gapMode(lastDay, today, cfg) {
  if (lastDay == null) return 'normal';
  const g = today - lastDay;
  return g >= cfg.gap.replace_days ? 'replace' : g >= cfg.gap.comeback_days ? 'comeback' : 'normal';
}

/** วันจบโดยประมาณ: คำนวณใหม่ทุกครั้ง ไม่เก็บ "หนี้" */
export function projectFinish(remainingSessions, paceMin, today, cfg) {
  const perDay = cfg.pace[String(paceMin)];
  if (!perDay) throw new Error('pace ไม่รู้จัก');
  if (remainingSessions <= 0) return today;
  return today + Math.ceil((remainingSessions / perDay) * 7 / cfg.study_days_per_week);
}

/** ความคืบหน้ารายสัปดาห์ · days = เลขวันที่ทำเซสชันจบอย่างน้อย 1 (รวมเซสชันสั้น) */
export function weekProgress(days, today, cfg) {
  const set = new Set(days), w0 = weekStart(today), goal = cfg.week_goal_days;
  const countIn = (ws) => { let n = 0; for (let d = ws; d < ws + 7; d++) if (set.has(d)) n++; return n; };
  const count = countIn(w0);
  let streak = count >= goal ? 1 : 0;
  for (let ws = w0 - 7; countIn(ws) >= goal; ws -= 7) streak++;   // สัปดาห์นี้ยังไม่ครบ ไม่ตัดสตรีคของสัปดาห์ก่อน
  return { count, goal, met: count >= goal, streakWeeks: streak };
}

/** ประเมินผลแบบวัดระดับ · scores = { a2:[ถูก,ทั้งหมด], b1:[..], b2:[..], c1:[..] } */
export function placementEstimate(scores, cfg) {
  const P = cfg.placement, B = P.bands;
  const pct = (b) => scores[b][1] ? scores[b][0] / scores[b][1] : 0;
  let passed = -1;
  while (passed + 1 < B.length && pct(B[passed + 1]) >= P.pass) passed++;
  // ก้ำกึ่ง = ระดับที่ไม่ผ่านขาดอีกไม่เกิน 1 ข้อ หรือระดับที่ผ่านล่าสุดผ่านแบบพอดีขั้นต่ำ → หน้าเว็บแสดงเป็น "ระหว่าง ... กับ ..."
  const need = (b) => Math.ceil(P.pass * scores[b][1] - 1e-9);
  const borderline = (passed + 1 < B.length && need(B[passed + 1]) - scores[B[passed + 1]][0] === 1)
    || (passed >= 0 && scores[B[passed]][0] === need(B[passed]));
  if (passed === B.length - 1) {                    // ผ่านระดับสูงสุดของแบบวัด: แน่น (≥ solid) ไปคอร์สถัดไป (c2) ไม่แน่นให้ซ้อมคอร์สระดับนั้นก่อน
    const solidTop = pct(B[passed]) >= P.solid;
    return { level: B[passed], position: solidTop ? 'high' : 'low', plan: [solidTop && P.beyond ? P.beyond : B[passed]], rounds: 1, borderline };
  }
  const next = B[passed + 1], high = pct(next) >= P.high;
  if (passed === -1) return { level: 'below-' + B[0], position: high ? 'high' : 'low', plan: [B[0]], rounds: high ? 1 : 2, borderline };
  const solid = pct(B[passed]) >= P.solid;
  if (high) return { level: B[passed], position: 'high', plan: [next], rounds: 1, borderline };
  return solid
    ? { level: B[passed], position: 'low', plan: [next], rounds: 2, borderline }
    : { level: B[passed], position: 'low', plan: [B[passed], next], rounds: 1, borderline };
}

/** ความพร้อมของหนึ่งทักษะ · checkpoint = {correct,n}|null · practice = {correct,n} (ตอบครั้งแรก 14 วัน ข้อระดับเป้าหมาย) */
export function readiness(checkpoint, practice, cfg) {
  const R = cfg.readiness;
  const hasC = !!checkpoint && checkpoint.n > 0, hasP = !!practice && practice.n >= R.min_practice_n;
  const n = (hasC ? checkpoint.n : 0) + (practice ? practice.n : 0);
  if ((!hasC && !hasP) || n < R.min_total_n) return { state: 'insufficient', value: null, n };
  const c = hasC ? 100 * checkpoint.correct / checkpoint.n : null, p = hasP ? 100 * practice.correct / practice.n : null;
  const value = Math.round(c != null && p != null ? R.w_checkpoint * c + R.w_practice * p : (c ?? p));
  return { state: value >= R.in_target ? 'in_target' : value >= R.near ? 'near' : 'far', value, n };
}

/** หัวข้อที่ต้องแทรกเซสชันซ่อม (ได้ไม่เกิน 1 หัวข้อ) · results = [{topic, correct, n}] */
export function remedialTopic(results, cfg) {
  const bad = results.filter((r) => r.n >= cfg.remedial.min_n && r.correct / r.n < cfg.remedial.below)
    .sort((a, b) => (a.correct / a.n - b.correct / b.n) || (b.n - a.n));
  return bad.length ? bad[0].topic : null;
}

/** สิทธิ์ต่อเวลาฟรีตามข้อรับรองความคุ้มค่า (เซิร์ฟเวอร์เป็นผู้ตัดสิน) */
export function guaranteeEligible({ fullSessions, totalSessions, checkpointsDone, finalCheckpointPct }, cfg) {
  const G = cfg.guarantee;
  return fullSessions / totalSessions >= G.min_session_ratio && checkpointsDone >= G.checkpoints && finalCheckpointPct < G.target_pct;
}
