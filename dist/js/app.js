// จุดเริ่มของแอปผู้เรียน: เส้นทางด้วย # · แถบล่าง 4 แท็บ · ซ่อนแถบระหว่างเซสชัน
import { openSession, flush } from './player.js';
import { viewToday, viewCourse, viewExtra, viewResults, viewBuy, viewAccount } from './views.js';
import { getPrefs } from './store.js';
import { el, esc } from './items.js';
import { api } from './api.js';
import { SITE } from './config.js';

const TABS = [['today', 'วันนี้'], ['course', 'คอร์ส'], ['extra', 'ฝึกเพิ่ม'], ['results', 'ผล']];
const VIEWS = { today: viewToday, course: viewCourse, extra: viewExtra, results: viewResults, buy: viewBuy, account: viewAccount };
const app = document.getElementById('app');
document.documentElement.dataset.fs = String(getPrefs().fontStep || 0);

function go(route) { if (location.hash.slice(1) === route) render(); else location.hash = route; }
async function render() {
  if (api.mode === 'remote') {                       // เว็บจริง: ระบบล็อกอินยังไม่เปิด → บอกตรง ๆ และพาไปวัดระดับฟรี (ไม่ทิ้งหน้าว่าง)
    app.innerHTML = `<div class="screen" id="view"><div class="topbar"><span class="brand">${esc(SITE.brand)}</span><span class="small">by TAYAK</span></div>
      <h1>ระบบเรียนกำลังจะเปิด</h1><div class="card"><p>ตอนนี้ลองวัดระดับภาษาอังกฤษฟรีได้แล้ว 25 ข้อ ประมาณ 20 นาที ไม่ต้องสมัคร</p>
      <a class="btn" id="goPlacement" href="placement.html">วัดระดับฟรี</a></div>
      <p class="small">เมื่อเปิดระบบเรียน คุณจะเรียนสัปดาห์แรกของคอร์สฟรีทั้งสัปดาห์ ติดตามประกาศได้ที่เพจ TAYAK</p></div>`;
    return;
  }
  const route = location.hash.slice(1) || 'today';
  app.innerHTML = '';
  const main = el('<div class="screen" id="view"></div>'); app.appendChild(main);
  if (route.startsWith('session-')) {
    await openSession(main, route.slice(8), (why, info) => {
      if (why === 'error') { main.innerHTML = `<div class="note">เปิดเซสชันไม่ได้ (${info})</div>`; main.appendChild(Object.assign(el('<button class="btn quiet">กลับหน้าวันนี้</button>'), { onclick: () => go('today') })); return; }
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
flush(); render();
