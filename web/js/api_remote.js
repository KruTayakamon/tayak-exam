// ต่อกับเซิร์ฟเวอร์จริง (Supabase Edge Functions) · **ยังไม่เคยรันจริง** รอ: บอสอนุมัติและรัน SQL · deploy ฟังก์ชัน · ใส่ค่าใน web/js/config.js
// สัญญาเดียวกับ api_demo.js · ผู้ที่มาทำต่อ: เติมการล็อกอิน Google ด้วย supabase-js (ดูแนวจาก tayak-cefr/kitchen_src/tpl.html ออบเจกต์ cloud)
import { SITE } from './config.js';

let token = null;                       // access token ของผู้ใช้ที่ล็อกอิน (ตั้งโดยโค้ดล็อกอิน)
export const setToken = (t) => { token = t; };
async function call(fn, body) {
  const r = await fetch(`${SITE.functions}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SITE.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'bad_response' }));
  if (!r.ok && !j.error) j.error = 'http_' + r.status;
  return j;
}
const COURSE = () => SITE.course;
export const remoteApi = {
  mode: 'remote',
  status: () => call('exam-billing', { action: 'status' }),
  checkout: (product, target) => call('exam-billing', { action: 'checkout', product, target, agree_terms: true }),
  verify: (order) => call('exam-billing', { action: 'verify', order }),
  enrol: (p) => { let src = null; try { src = localStorage.getItem('cfk_src_post'); } catch { /* ไม่จำที่มา */ } return call('exam-api', { action: 'enrol', course: COURSE(), src_post: src, ...p }); },
  home: () => call('exam-api', { action: 'home', course: COURSE() }),
  session: (p) => call('exam-api', { action: 'session', course: COURSE(), ...p }),
  sync: (p) => call('exam-api', { action: 'sync', course: COURSE(), ...p }),
  report: (p) => call('exam-api', { action: 'report', ...p }),
  checkpointStart: (n) => call('exam-api', { action: 'checkpoint_start', course: COURSE(), n }),
  checkpointSubmit: (n, answers) => call('exam-api', { action: 'checkpoint_submit', course: COURSE(), n, answers }),
  placementItems: () => call('exam-api', { action: 'placement_items' }),
  placementGrade: (answers, src) => call('exam-api', { action: 'placement_grade', answers, src_post: src || null }),
};
