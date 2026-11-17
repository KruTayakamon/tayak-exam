// จุดเริ่มของแอปผู้เรียน: เส้นทางด้วย # · แถบล่าง 4 แท็บ · ซ่อนแถบระหว่างเซสชัน
import { openSession, flush } from './player.js';
import { viewToday, viewCourse, viewExtra, viewResults, viewBuy, viewAccount } from './views.js';
import { getPrefs } from './store.js';
import { el, esc } from './items.js';
import { api } from './api.js';
import { SITE } from './config.js';
import { authInit, signIn } from './auth.js';

const TABS = [['today', 'วันนี้'], ['course', 'คอร์ส'], ['extra', 'ฝึกเพิ่ม'], ['results', 'ผล']];
const VIEWS = { today: viewToday, course: viewCourse, extra: viewExtra, results: viewResults, buy: viewBuy, account: viewAccount };
const app = document.getElementById('app');
document.documentElement.dataset.fs = String(getPrefs().fontStep || 0);

// เว็บจริง: ต้องล็อกอินก่อนเรียน (สัปดาห์แรกฟรี) · ยอมรับนโยบายความเป็นส่วนตัวก่อนกดล็อกอิน
let authed = false;
async function signedIn() {
  if (authed) return true;
  const u = await authInit(() => render());
  if (u) { authed = true; return true; }
  let agreed = false;
  try { agreed = localStorage.getItem('cfk_consent') === String(SITE.consentVersion); } catch { /* ไม่มีที่เก็บ */ }
  app.innerHTML = `<div class="screen" id="view"><div class="topbar"><span class="brand">${esc(SITE.brand)}</span><span class="small">by TAYAK</span></div>
    <h1>เข้าสู่ระบบเพื่อเริ่มเรียน</h1>
    <div class="card"><ul class="list">
      <li><span class="tick">✓</span><span>เรียนสัปดาห์แรกฟรีทั้งสัปดาห์ วันละประมาณ 20 นาที</span></li>
      <li><span class="tick">✓</span><span>ระบบจำความคืบหน้าและพาทบทวนข้อที่เคยผิดตามเวลา</span></li>
      <li><span class="tick">✓</span><span>ไม่ต้องใส่บัตร ไม่มีการตัดเงินอัตโนมัติ</span></li></ul></div>
    <label class="check"><input type="checkbox" id="consent" ${agreed ? 'checked' : ''}><span>ฉันอ่านและยอมรับ <a href="privacy.html" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a> (เก็บอีเมลและความคืบหน้าการเรียนเท่าที่จำเป็น)</span></label>
    <button class="btn" id="signIn" ${agreed ? '' : 'disabled'}>เข้าสู่ระบบด้วย Google</button>
    <p class="small" id="authMsg"></p>
    <a class="btn quiet" href="placement.html" id="goPlacement">ยังไม่รู้ระดับ วัดระดับฟรีก่อน</a></div>`;
  const box = app.querySelector('#consent'), btn = app.querySelector('#signIn');
  box.onchange = () => { btn.disabled = !box.checked; try { localStorage.setItem('cfk_consent', box.checked ? String(SITE.consentVersion) : ''); } catch { /* ไม่มีที่เก็บ */ } };
  btn.onclick = async () => { btn.disabled = true; try { await signIn(); } catch (e) { app.querySelector('#authMsg').textContent = 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'; btn.disabled = false; } };
  return false;
}

function go(route) { if (location.hash.slice(1) === route) render(); else location.hash = route; }
async function render() {
  if (api.mode === 'remote' && !(await signedIn())) return;
  const route = location.hash.slice(1) || 'today';
  app.innerHTML = '';
  const main = el('<div class="screen" id="view"></div>'); app.appendChild(main);
  if (route.startsWith('session-')) {
    await openSession(main, route.slice(8), (why, info) => {
      if (why === 'error') { if (info === 'trial_ended' || info === 'no_access') { go('buy'); return; } const MSG = { content_missing: 'บทเรียนนี้ยังไม่เปิด', daily_cap: 'วันนี้เรียนครบจำนวนเซสชันแล้ว พรุ่งนี้มาต่อนะ', no_session: 'กรุณาเข้าสู่ระบบอีกครั้ง' }; main.innerHTML = `<div class="note">${MSG[info] || `เปิดเซสชันไม่ได้ (${esc(String(info))})`}</div>`; main.appendChild(Object.assign(el('<button class="btn quiet">กลับหน้าวันนี้</button>'), { onclick: () => go('today') })); return; }
      go('today');
    });
    return;
  }
  await (VIEWS[route] || viewToday)(main, go);
  const nav = el('<nav class="nav" aria-label="เมนูหลัก">' + TABS.map(([r, t]) => `<button data-route="${r}" class="${r === route ? 'on' : ''}">${t}</button>`).join('') + '</nav>');
  nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.route); });
  app.appendChild(nav);
  app.appendChild(Object.assign(el('<button class="link" id="accountLink">บัญชีและการตั้งค่า</button>'), { onclick: () => go('account') }));
}
window.addEventListener('hashchange', render);
window.addEventListener('online', () => flush());
// กลับจากหน้าจ่ายของ Beam: /app?order=<รหัส>#buy → ถามเซิร์ฟเวอร์ให้ตรวจกับ Beam แล้วแสดงผล (ไม่เชื่อค่าในลิงก์)
const ORDER = new URLSearchParams(location.search).get('order');
async function afterPay() {
  if (!(await signedIn())) return;
  history.replaceState(null, '', location.pathname + '#buy');
  const r = await api.verify(ORDER).catch(() => null);
  app.innerHTML = ''; const main = el('<div class="screen" id="view"></div>'); app.appendChild(main);
  await viewBuy(main, go, r && r.credited ? 'ชำระเงินสำเร็จ ได้รับสิทธิ์แล้ว ขอบคุณครับ เรียนต่อได้เลย' : 'ยังไม่พบการชำระเงิน ถ้าเพิ่งจ่ายให้รอสักครู่แล้วกด "ตรวจสอบการชำระเงิน"');
}
flush(); if (ORDER && api.mode === 'remote') afterPay(); else render();
