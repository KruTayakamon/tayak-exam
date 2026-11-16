// ตัวตรวจคำตอบ: ที่เดียวของทั้งระบบ (หน้าเว็บใช้เฉลยทันที · เซิร์ฟเวอร์ใช้ตัดสินจริง) · ฟังก์ชันล้วน · เทสต์ tests/test_grade.mjs
export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** สะกดผิดได้ 1 ตัว (แทน เพิ่ม หรือขาด) เมื่อคำตอบยาวตั้งแต่ 4 ตัวอักษร */
export function near(a, b) {
  if (a === b) return true;
  if (b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/** body = ข้อที่ build แล้ว (ตัวเลือกสลับแล้ว มี answer) · q = ลำดับคำถามย่อย · answer = สิ่งที่ผู้เรียนตอบ */
export function grade(body, q, answer) {
  if (body.kind === 'mcq') return Number(answer) === body.answer;
  if (body.kind === 'type') return (body.accept ?? [body.answer]).some((x) => near(norm(answer), norm(x)));
  if (body.kind === 'order') return Array.isArray(answer) && answer.map(norm).join('|') === body.chunks.map(norm).join('|');
  const qq = body.questions?.[q];
  return !!qq && answer !== null && answer !== undefined && answer !== '' && Number(answer) === qq.answer;
}

/** จำนวนคำถามย่อย (คะแนน) ของข้อ */
export const pointsOf = (body) => (body.questions ? body.questions.length : 1);

/** ตัดเฉลยและเหตุผลออก (แบบวัดระดับ และชุดวัดผลก่อนส่ง) · shuffle = ฟังก์ชันสลับชิ้นของข้อเรียงประโยค */
export function strip(body, shuffle = (a) => [...a].sort(() => Math.random() - 0.5)) {
  const cut = (c) => c.map((x) => ({ t: x.t }));
  const o = { id: body.id, kind: body.kind, skill: body.skill, stem: body.stem, title: body.title, text: body.text, passage: body.passage, script: body.script };
  if (body.choices) o.choices = cut(body.choices);
  if (body.questions) o.questions = body.questions.map((x) => ({ stem: x.stem, choices: cut(x.choices) }));
  if (body.kind === 'order') o.chunks = shuffle(body.chunks);
  return o;
}
