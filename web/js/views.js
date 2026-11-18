// จอนอกเซสชัน: ตั้งแผน · วันนี้ · คอร์ส · ฝึกเพิ่ม · ผล · ซื้อ · บัญชี (ตามต้นแบบ design/cefr_prototype.html)
import { api } from './api.js';
import { getSession, getPrefs, putPrefs, getStars, mergeStars } from './store.js';
import { el, esc } from './items.js';
import { dayKey } from './engine/engine.mjs';
import { SITE } from './config.js';
import { quote } from './engine/pricing.mjs';
import { currentUser, signOut } from './auth.js';
import { cpCard } from './checkpoint.js';

const SKILL_TH = { gm: 'ไวยากรณ์', vo: 'คำศัพท์', rd: 'การอ่าน', li: 'การฟัง', dlg: 'สนทนา', wr: 'การเขียน', sp: 'การพูด' };
const READY = { in_target: ['อยู่ในช่วงเป้า', 'ok'], near: ['ใกล้เป้า', 'near'], far: ['ยังห่างเป้า', 'far'], insufficient: ['ข้อมูลยังไม่พอ', 'far'] };
const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const thDate = (d) => { const [y, m, dd] = dayKey(d).split('-').map(Number); return `${dd} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][m - 1]} ${y + 543}`; };
export const header = () => `<div class="topbar"><span class="brand">${esc(SITE.brand)}</span><span class="small">by TAYAK</span></div>`;
const BADGE_TH = { perfect: ['👑', 'ถูกหมดทุกข้อ'], great: ['🌟', 'ถูกเกิน 80%'], streak: ['🔥', 'ถูกติดกัน 5 ข้อขึ้นไป'], wrote: ['✍️', 'ลงมือเขียน/พูดเอง'], done: ['✅', 'เรียนครบวัน'] };
/** การ์ดดาวและตราสะสม (มติบอส 17 พ.ย. รอบ 17) · ตราที่ยังไม่ได้แสดงเป็นเงาจาง ๆ ให้อยากเก็บ */
function trophyCard() {
  const t = getStars();
  const rank = t.stars >= 300 ? ['💎', 'นักสะสมดาวเพชร'] : t.stars >= 150 ? ['🥇', 'นักสะสมดาวทอง'] : t.stars >= 60 ? ['🥈', 'นักสะสมดาวเงิน'] : t.stars >= 20 ? ['🥉', 'นักสะสมดาวทองแดง'] : ['🌱', 'ดาวดวงแรก ๆ'];
  return `<div class="card trophy" id="starStats"><div class="row"><h2 class="grow">ดาวและตราสะสม</h2><span class="rank">${rank[0]} ${rank[1]}</span></div>
    <div class="statgrid"><div><b>⭐ ${t.stars}</b><small>ดาวทั้งหมด</small></div><div><b>👑 ${t.perfect}</b><small>วันที่ถูกหมด</small></div><div><b>🔥 ${t.best}</b><small>ถูกติดกันสูงสุด</small></div></div>
    <div class="badges">${Object.entries(BADGE_TH).map(([k, [i, th]]) => `<span class="badge b-${k}${t.badges[k] ? '' : ' off'}"><i>${i}</i>${th}${t.badges[k] ? ` ×${t.badges[k]}` : ''}</span>`).join('')}</div>
    <p class="small">ตอบถูกตั้งแต่ครั้งแรก 1 ข้อ = 1 ดาว · เก็บไว้ในเครื่องนี้</p></div>`;
}
const demoNote = () => (api.mode === 'demo' ? '<div class="demo">โหมดสาธิต: เนื้อหาร่างสัปดาห์ 1 ของคอร์ส B1 ข้อมูลเก็บในเครื่องนี้เท่านั้น</div>' : '');

function readyRows(r) {
  const keys = Object.keys(r);
  if (!keys.length) return '<p class="small">ยังไม่มีข้อมูล ทำเซสชันแรกก่อน</p>';
  return keys.map((k) => { const x = r[k], [t, c] = READY[x.state]; return `<div class="skill"><span>${SKILL_TH[k] || k}</span><div class="bar" role="img" aria-label="${SKILL_TH[k] || k} ${x.value ?? 0} จากเกณฑ์ 70"><span style="width:${x.value ?? 0}%"></span><em style="left:70%"></em></div><small class="s-${c}">${t}</small></div>`; }).join('');
}

export async function viewPlan(root, go) {
  root.innerHTML = header() + demoNote() + '<h1>ตั้งแผนเรียน</h1><h2>วันละกี่นาที</h2>';
  const chips = el('<div class="chips">' + [[10, '10 นาที · 24 สัปดาห์'], [20, '20 นาที · 12 สัปดาห์'], [40, '40 นาที · 6 สัปดาห์']].map(([p, t]) => `<button class="chip${p === 20 ? ' on' : ''}" data-pace="${p}">${t}</button>`).join('') + '</div>');
  chips.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); c.classList.add('on'); });
  const b = el('<button class="btn" id="usePlan">ใช้แผนนี้</button>');
  b.addEventListener('click', async () => { await api.enrol({ pace: Number(chips.querySelector('.on').dataset.pace) }); go('today'); });
  root.append(chips, el('<p class="small">เปลี่ยนจังหวะได้ทุกเมื่อในหน้าบัญชี ระบบจะคำนวณวันจบให้ใหม่</p>'), b);
}

export async function viewToday(root, go) {
  const h = await api.home();
  if (!h || h.error === 'not_enrolled') return viewPlan(root, go);
  if (h.error) { root.innerHTML = header() + `<div class="note">โหลดข้อมูลไม่สำเร็จ (${esc(h.error)}) ลองใหม่อีกครั้ง</div>`; return; }
  const paused = getSession();
  mergeStars(h.stars);                                   // ดาวจากเครื่องอื่น
  root.innerHTML = header() + demoNote();
  if (h.access && h.access.level === 'trial') root.appendChild(el(`<div class="row"><span class="tag" id="trialTag">สัปดาห์ทดลองฟรี</span><a class="link" href="#buy">ดูราคาคอร์ส</a></div>`));
  if (h.access && h.access.level === 'review') root.appendChild(el('<div class="card" id="trialEnded"><h2>จบสัปดาห์ทดลองฟรีแล้ว</h2><p class="small">ยังทบทวนข้อที่เคยเรียนได้ต่อ ส่วนบทเรียนใหม่เปิดเมื่อซื้อคอร์ส</p><a class="btn" href="#buy">ดูราคาคอร์ส</a></div>'));
  if (h.content_missing) root.appendChild(el(h.pointer.week === 1 ? '<div class="card" id="soonCard"><h2>บทเรียนกำลังจะเปิด</h2><p class="small">เนื้อหาสัปดาห์แรกอยู่ระหว่างตรวจครั้งสุดท้าย เปิดให้เรียนเร็ว ๆ นี้ ระหว่างนี้ลองวัดระดับฟรีได้</p><a class="btn quiet" href="placement.html">วัดระดับฟรี</a></div>' : '<div class="card"><h2>จบเนื้อหาที่มีแล้ว</h2><p class="small">สัปดาห์ถัดไปยังไม่มีเนื้อหา</p></div>'));
  else if (h.access && h.access.level === 'review') { /* เนื้อหาใหม่ล็อก แสดงแค่ปุ่มทบทวนด้านล่าง */ }
  else {
    const st = getStars();
    if (st.stars) root.appendChild(el(`<a class="starchip" id="starChip" href="#results">⭐ ${st.stars} ดาว${st.perfect ? ` · 👑 ${st.perfect}` : ''}${st.best >= 5 ? ` · 🔥 ${st.best}` : ''}</a>`));
    const cpo = cpCard(h, true); if (cpo) root.appendChild(el(cpo));
    root.appendChild(el(`<div><p class="small">สัปดาห์ ${h.pointer.week} จาก 12 · ${esc(h.theme)}</p><h1 id="todayTitle">วันที่ ${h.pointer.day}: ${esc(h.title)}</h1></div>`));
    const main = el(`<button class="btn" id="startBtn">${paused && paused.kind === 'full' ? 'ทำต่อจากที่ค้าง' : `เริ่มเซสชันวันนี้ · ${h.pace === 10 ? 10 : h.session_minutes} นาที`}</button>`);
    main.addEventListener('click', () => go('session-full'));
    root.appendChild(main);
  }
  const short = el(`<button class="btn quiet" id="shortBtn" ${h.due ? '' : 'disabled'}>${h.due ? `วันนี้ยุ่ง ทบทวน 5 นาที (${h.due} ข้อถึงกำหนด)` : 'ยังไม่มีข้อถึงกำหนดทบทวน'}</button>`);
  short.addEventListener('click', () => go('session-short'));
  root.appendChild(short);
  root.appendChild(el(`<div class="card"><div class="row"><h2 class="grow" id="weekCount">สัปดาห์นี้ ${h.week.count} จาก ${h.week.goal} วัน</h2><span class="small">${h.week.streakWeeks ? `ต่อเนื่อง ${h.week.streakWeeks} สัปดาห์` : ''}</span></div><div class="week">` + h.week.days.map((on, i) => `<div class="${on ? 'done' : i === h.week.todayIndex ? 'today' : ''}">${DOW[i]}<span>${on ? '✓' : i === h.week.todayIndex ? 'วันนี้' : '–'}</span></div>`).join('') + '</div></div>'));
  root.appendChild(el(`<div class="card"><div class="row"><h2 class="grow">ความพร้อม</h2><span class="small">เรียนแล้ว ${Math.floor(h.minutes / 60)} ชม. ${h.minutes % 60} นาที</span></div>${readyRows(h.readiness)}<p class="small">ประเมินจากแบบฝึกของเรา ไม่ใช่ผลสอบ · คาดว่าจบคอร์ส ${thDate(h.finish_day)}</p></div>`));
}

export async function viewCourse(root) {
  const h = await api.home();
  root.innerHTML = header() + '<h1>คอร์สเป้าหมาย B1</h1><p class="small">12 สัปดาห์ สัปดาห์ละ 6 วัน</p>';
  const cur = h && h.pointer ? h.pointer.week : 1;
  root.appendChild(el('<div class="card">' + Array.from({ length: 12 }, (_, i) => `<div class="row" style="justify-content:space-between"><span>สัปดาห์ ${i + 1}</span><span class="small">${i + 1 < cur ? 'เรียนแล้ว' : i + 1 === cur ? `กำลังเรียน วันที่ ${h.pointer.day}` : i === 3 || i === 7 || i === 11 ? 'มีชุดวัดผลท้ายสัปดาห์' : ''}</span></div>`).join('') + '</div>'));
}

export async function viewExtra(root) {
  root.innerHTML = header() + '<h1>ฝึกเพิ่ม</h1><div class="card"><h2>สมุดข้อผิด · ฝึกตามทักษะ · ชุดจำลอง</h2><p class="small">ส่วนนี้ยังไม่เปิดในรุ่นนี้</p></div>';
}

export async function viewResults(root) {
  const h = await api.home();
  root.innerHTML = header() + '<h1>ผลและความพร้อม</h1>';
  if (!h || h.error) { root.appendChild(el('<p class="small">ยังไม่มีข้อมูล</p>')); return; }
  mergeStars(h.stars);
  root.appendChild(el(trophyCard()));
  root.appendChild(el(`<p class="small">สัปดาห์ ${h.pointer.week} จาก 12 · เซสชันเต็ม ${h.full_sessions} ครั้ง · เรียนแล้ว ${Math.floor(h.minutes / 60)} ชม. ${h.minutes % 60} นาที</p>`));
  root.appendChild(el(`<div class="card"><h2>ความพร้อมรายทักษะ</h2>${readyRows(h.readiness)}<p class="small">คำนวณจากคำตอบครั้งแรกใน 14 วันล่าสุด เป็นการประเมินจากแบบฝึกของเรา ไม่ใช่ผลสอบ</p></div>`));
  root.appendChild(el(cpCard(h)));
}

const thDay = (ms) => new Date(ms).toLocaleDateString('th-TH', { dateStyle: 'medium' });
/** หน้าคอร์สและราคา: สิทธิ์ที่มี · ปุ่มซื้อ (ต้องยอมรับข้อกำหนดก่อน) · ตรวจสอบการชำระเงิน · ราคาและสินค้าที่ขายมาจากเซิร์ฟเวอร์ (exam-billing status) */
export async function viewBuy(root, go, msg) {
  let s = await api.status().catch(() => null);
  root.innerHTML = header() + '<h1>คอร์สและราคา</h1>';
  if (msg) root.appendChild(el(`<div class="note" id="buyMsg">${esc(msg)}</div>`));
  const live = !!(s && !s.error && s.prices);
  if (!live) {                                             // ยังไม่ล็อกอินหรือระบบชำระเงินขัดข้อง: แสดงราคาจากกติกาเดียวกับเซิร์ฟเวอร์ แต่ไม่มีปุ่มซื้อ
    s = { prices: ['cefr-b1'].map((p) => quote(p, Date.now())), entitlements: [], orders: [] };
    root.appendChild(el('<div class="note" id="payingSoon">ยังเปิดหน้าซื้อไม่ได้ในขณะนี้ ลองใหม่อีกครั้งภายหลัง ระหว่างนี้เรียนสัปดาห์แรกฟรีได้เลย</div>'));
  }
  const now = Date.now(), ents = (s.entitlements || []).filter((e) => e.expires_at > now);
  const PROD_TH = Object.fromEntries((s.prices || []).map((p) => [p.product, p.th]));
  if (ents.length) root.appendChild(el(`<div class="card" id="myAccess"><h2>สิทธิ์ของคุณ</h2><ul class="list">${ents.map((e) => `<li><span class="tick">✓</span><span>${esc(PROD_TH[e.product] || e.product)} ใช้ได้ถึง <b>${thDay(e.expires_at)}</b></span></li>`).join('')}</ul></div>`));
  const pending = (s.orders || []).filter((o) => o.status === 'pending');
  if (live && pending.length) {
    const c = el(`<div class="card" id="pendingBox"><h2>รอยืนยันการชำระเงิน</h2><p class="small">ถ้าจ่ายแล้ว กดตรวจสอบได้เลย ระบบจะถามผู้ให้บริการชำระเงินโดยตรง</p><button class="btn" id="verifyBtn">ตรวจสอบการชำระเงิน</button></div>`);
    c.querySelector('#verifyBtn').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'กำลังตรวจสอบ…'; const r = await api.verify().catch(() => null); viewBuy(root, go, r && r.credited ? 'ชำระเงินสำเร็จ ได้รับสิทธิ์แล้ว ขอบคุณครับ' : 'ยังไม่พบการชำระเงิน ถ้าเพิ่งจ่ายให้รอสักครู่แล้วกดอีกครั้ง'); };
    root.appendChild(c);
  }
  const hasCourse = ents.some((e) => e.product !== 'cefr-extend');
  let agreed = false;
  const box = live ? el(`<label class="check" id="termsBox"><input type="checkbox" id="terms"><span>ฉันอ่านและยอมรับ <a href="terms.html" target="_blank" rel="noopener">ข้อกำหนดการใช้บริการและการคืนเงิน</a></span></label>`) : null;
  const buttons = [];
  if (box) { root.appendChild(box); box.querySelector('#terms').onchange = (e) => { agreed = e.target.checked; buttons.forEach((b) => { b.disabled = !agreed; }); }; }
  for (const p of s.prices || []) {
    if (p.product === 'cefr-extend' && !hasCourse) continue;        // ต่อเวลาได้เฉพาะคนที่มีคอร์สแล้ว
    const c = el(`<div class="card"><div class="row"><h2 class="grow">${esc(p.th)}</h2>${p.launch ? '<span class="tag">ราคาเปิดตัว</span>' : ''}</div><div class="row"><span class="price">${p.amount} บาท</span>${p.launch ? `<span class="was">${p.list} บาท</span>` : ''}</div><p class="small">ใช้ได้ ${p.days} วัน จ่ายครั้งเดียว ไม่ต่ออายุเอง · พร้อมเพย์</p></div>`);
    if (live) {
      const b = el(`<button class="btn" data-buy="${esc(p.product)}" disabled>ซื้อ ${p.amount} บาท</button>`);
      b.onclick = async () => {
        if (!agreed) return;
        b.disabled = true; b.textContent = 'กำลังสร้างลิงก์ชำระเงิน…';
        const target = p.product === 'cefr-extend' ? (ents.find((e) => e.product !== 'cefr-extend') || {}).product : undefined;
        const r = await api.checkout(p.product, target).catch(() => null);
        if (r && r.url) { location.href = r.url; return; }
        b.disabled = false; b.textContent = `ซื้อ ${p.amount} บาท`;
        const M = { billing_off: 'ระบบชำระเงินยังไม่เปิด', not_on_sale: 'สินค้านี้ยังไม่เปิดขาย', no_session: 'กรุณาเข้าสู่ระบบอีกครั้ง' };
        alert(M[r && r.error] || 'สร้างลิงก์ชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
      };
      c.appendChild(b); buttons.push(b);
    }
    root.appendChild(c);
  }
  root.appendChild(el('<p class="small">เราไม่สัญญาผลสอบ · คืนเงินเต็มจำนวนได้ภายใน 7 วันถ้าเรียนไม่เกิน 3 เซสชัน · <a href="terms.html">อ่านข้อกำหนดทั้งหมด</a></p>'));
}

export async function viewAccount(root, go) {
  const prefs = getPrefs();
  root.innerHTML = header() + '<h1>บัญชีและการตั้งค่า</h1>';
  const fs = el('<div class="card"><h2>ขนาดตัวอักษร</h2><div class="chips">' + ['ปกติ', 'ใหญ่', 'ใหญ่มาก'].map((t, i) => `<button class="chip${prefs.fontStep === i ? ' on' : ''}" data-fs="${i}">${t}</button>`).join('') + '</div></div>');
  fs.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; putPrefs({ ...getPrefs(), fontStep: Number(c.dataset.fs) }); document.documentElement.dataset.fs = c.dataset.fs; fs.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); c.classList.add('on'); });
  root.appendChild(fs);
  const u = currentUser();
  if (u) {
    const a = el(`<div class="card"><h2>บัญชี</h2><p class="small">เข้าสู่ระบบด้วย ${esc(u.email || '')}</p><button class="btn quiet" id="signOut">ออกจากระบบ</button><a class="link" href="privacy.html">นโยบายความเป็นส่วนตัว</a></div>`);
    a.querySelector('#signOut').addEventListener('click', async () => { await signOut(); location.reload(); });
    root.appendChild(a);
  }
  if (api.mode === 'demo') {
    const d = el('<div class="card"><h2>เครื่องมือของโหมดสาธิต</h2><p class="small">ใช้ดูว่าข้อที่ผิดกลับมาทบทวนในวันถัดไปอย่างไร</p><button class="btn quiet" id="demoNext">ข้ามไปวันถัดไป</button><button class="btn quiet" id="demoReset">ล้างข้อมูลสาธิต เริ่มใหม่</button></div>');
    d.querySelector('#demoNext').addEventListener('click', () => { api.demoShiftDay(1); go('today'); });
    d.querySelector('#demoReset').addEventListener('click', () => { api.demoReset(); try { localStorage.removeItem('cfk-session'); localStorage.removeItem('cfk-queue'); } catch { /* ไม่มีที่เก็บ */ } go('today'); });
    root.appendChild(d);
  }
}
