// ล็อกอินด้วย Google ผ่าน Supabase Auth (โปรเจกต์เดียวกับเกมครัว) · ใช้เฉพาะเว็บจริง
// ไคลเอนต์ Supabase โหลดจากไฟล์ของเราเอง vendor/supabase.js (บางเครือข่ายโรงเรียนบล็อก CDN · แนวเดียวกับเกมครัว)
import { SITE } from './config.js';
import { setToken } from './api_remote.js';

let sb = null, user = null, token = null;
export const currentUser = () => user;
export const currentToken = () => token;   // ใช้โดยหน้าแผงเจ้าของ (admin.js)

/** เริ่มระบบล็อกอิน · คืนผู้ใช้ที่ล็อกอินอยู่ หรือ null · onChange เรียกเมื่อสถานะเปลี่ยน (ล็อกอิน/ออก/ต่ออายุ token) */
export async function authInit(onChange) {
  if (sb) return user;
  if (!globalThis.supabase || !SITE.supabaseUrl) return null;
  sb = globalThis.supabase.createClient(SITE.supabaseUrl, SITE.anonKey);
  const { data } = await sb.auth.getSession();
  user = data.session ? data.session.user : null; token = data.session ? data.session.access_token : null; setToken(data.session ? data.session.access_token : null);
  sb.auth.onAuthStateChange((_ev, s) => {
    const was = user && user.id;
    user = s ? s.user : null; token = s ? s.access_token : null; setToken(s ? s.access_token : null);
    if ((user && user.id) !== was && onChange) onChange(user);
  });
  return user;
}

/** ไปหน้าล็อกอินของ Google แล้วกลับมาที่หน้าเรียน */
export async function signIn() {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { await sb.auth.signOut(); user = null; token = null; setToken(null); }
