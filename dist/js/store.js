// ที่เก็บในเครื่องผู้เรียน: เซสชันที่ทำค้าง คิวคำตอบที่ยังไม่ได้ส่ง และค่าที่ผู้เรียนตั้ง · ทุกการอ่านเขียนห่อ try/catch (โหมดส่วนตัวอาจใช้ไม่ได้)
const K = { session: 'cfk-session', queue: 'cfk-queue', prefs: 'cfk-prefs' };
const mem = {};                         // ที่เก็บสำรองในหน่วยความจำ: ใช้เมื่อเบราว์เซอร์ไม่ให้ใช้ localStorage (ข้อมูลอยู่ได้จนปิดหน้า)
export function load(key, fallback) {
  if (key in mem) return JSON.parse(mem[key]);
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, value) {
  const v = JSON.stringify(value);
  try { localStorage.setItem(key, v); delete mem[key]; return true; } catch { mem[key] = v; return false; }
}
export function drop(key) { delete mem[key]; try { localStorage.removeItem(key); } catch { /* ไม่มีที่เก็บ */ } }

export const getSession = () => load(K.session, null);
export const putSession = (s) => save(K.session, s);
export const clearSession = () => drop(K.session);

export const getQueue = () => load(K.queue, []);
export function pushEvent(ev) { const q = getQueue(); q.push(ev); save(K.queue, q); return q; }
export function dropEvents(eids) { const s = new Set(eids); save(K.queue, getQueue().filter((e) => !s.has(e.eid))); }

export const getPrefs = () => load(K.prefs, { fontStep: 0 });
export const putPrefs = (p) => save(K.prefs, p);

/** รหัสเหตุการณ์ไม่ซ้ำ (เซิร์ฟเวอร์ใช้กันนับซ้ำ) */
export function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
}

/** ดาวและตราสะสม (ในเครื่องนี้) · stars = ข้อที่ถูกตั้งแต่ครั้งแรก · perfect = เซสชันที่ถูกหมด · best = ถูกติดกันมากสุด · badges = จำนวนครั้งที่ได้แต่ละตรา */
export const getStars = () => ({ stars: 0, perfect: 0, best: 0, sessions: 0, wrote: 0, badges: {}, ...load('cfk-stars', {}) });
export const putStars = (v) => save('cfk-stars', v);
