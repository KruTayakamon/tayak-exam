// แผงเจ้าของ /admin · เฉพาะอีเมลที่อยู่ใน secret EXAM_OWNER_EMAILS (ตรวจที่เซิร์ฟเวอร์ exam-admin ทุกคำขอ · หน้านี้ไม่ได้ตัดสินสิทธิ์เอง)
// สเปก docs/cefr/06_owner_panel.md · รอบแรก (17 พ.ย. 2569): ภาพรวม · ผู้เรียน (ดู/ให้สิทธิ์ฟรี/เพิกถอน) · คำสั่งซื้อ · รายงานข้อ · ประวัติการกระทำ
import { el, esc } from './items.js';
import { SITE } from './config.js';
import { authInit, signIn, signOut, currentUser, currentToken } from './auth.js';

const app = document.getElementById('app');
const TABS = [['overview', 'ภาพรวม'], ['learner', 'ผู้เรียน'], ['orders', 'คำสั่งซื้อ'], ['reports', 'รายงานข้อ'], ['log', 'ประวัติ']];
const PRODUCT_TH = { 'cefr-b1': 'คอร์ส B1', 'cefr-b2': 'คอร์ส B2', 'cefr-a2': 'คอร์ส A2', 'cefr-c1': 'คอร์ส C1', 'cefr-c2': 'คอร์ส C2', 'cefr-all': 'ทุกคอร์ส', 'cefr-extend': 'ต่อเวลา' };
const thDate = (s) => (s ? new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const head = () => `<div class="topbar"><span class="brand">${esc(SITE.brand)} · แผงเจ้าของ</span><button class="link" id="out">ออกจากระบบ</button></div>`;

async function call(action, body = {}) {
  const r = await fetch(`${SITE.functions}/exam-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SITE.anonKey, Authorization: `Bearer ${currentToken()}` }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({ error: 'bad_response' }));
  if (!r.ok && !j.error) j.error = 'http_' + r.status;
  return j;
}
const fail = (j) => `<div class="note">${j.error === 'forbidden' ? 'บัญชีนี้ไม่มีสิทธิ์เข้าแผงเจ้าของ' : `ทำรายการไม่สำเร็จ (${esc(j.error || 'error')})`}</div>`;

async function overview(main) {
  const o = await call('overview');
  if (o.error) { main.innerHTML = fail(o); return; }
  const f = o.funnel_30d || {};
  main.innerHTML = `<div class="statgrid"><div><b>${o.revenue.day}</b><small>บาท วันนี้</small></div><div><b>${o.revenue.week}</b><small>บาท 7 วัน</small></div><div><b>${o.revenue.month}</b><small>บาท 30 วัน</small></div></div>
    <div class="card"><h2>เส้นทางผู้เรียน 30 วัน</h2><ul class="list">
      <li><span class="tick">1</span><span>ทำแบบวัดระดับ <b>${f.placements ?? 0}</b> ครั้ง</span></li>
      <li><span class="tick">2</span><span>สมัครเรียน (ล็อกอินและตั้งแผน) <b>${f.enrolments ?? 0}</b> คน</span></li>
      <li><span class="tick">3</span><span>ซื้อคอร์ส <b>${f.paid_orders ?? 0}</b> รายการ</span></li></ul>
      <p class="small">ผู้เรียนที่เข้าเรียนใน 7 วัน: <b>${o.active_learners_7d}</b> คน</p></div>
    <div class="card"><h2>รอจัดการ</h2><ul class="list">
      <li><span class="tick">!</span><span>คำสั่งซื้อรอชำระ ${o.pending_orders}</span></li>
      <li><span class="tick">!</span><span>รายงานข้อที่ยังไม่ปิด ${o.open_reports}</span></li>
      <li><span class="tick">✓</span><span>ข้อที่อนุมัติแล้ว ${o.approved_items} · ร่าง ${o.draft_items}</span></li></ul></div>`;
}

async function learner(main) {
  main.innerHTML = `<div class="card"><h2>ค้นผู้เรียนด้วยอีเมล</h2><label class="field">อีเมล<input id="em" type="email" autocomplete="off" spellcheck="false"></label><button class="btn" id="find">ค้นหา</button></div><div id="res" class="screen"></div>`;
  const res = main.querySelector('#res'), em = main.querySelector('#em');
  const show = async () => {
    const email = em.value.trim(); if (!email) return;
    res.innerHTML = '<p class="small">กำลังค้น…</p>';
    const d = await call('learner', { email });
    if (d.error === 'no_user') { res.innerHTML = '<div class="note">ไม่พบบัญชีนี้ (ผู้เรียนต้องล็อกอินเว็บอย่างน้อยหนึ่งครั้งก่อน)</div>'; return; }
    if (d.error) { res.innerHTML = fail(d); return; }
    const en = d.enrolments.map((e) => `<li><span class="tick">✓</span><span>คอร์ส ${esc(e.course.toUpperCase())} · สัปดาห์ ${e.week} วันที่ ${e.day} · จังหวะ ${e.pace} นาที${e.stars ? ` · ⭐ ${e.stars.stars}` : ''}</span></li>`).join('') || '<li><span class="tick">-</span><span>ยังไม่ได้สมัครเรียน</span></li>';
    const ents = d.entitlements.map((e) => `<li><span class="tick">✓</span><span>${esc(PRODUCT_TH[e.product] || e.product)} ถึง ${thDate(e.expires_at)} (${esc(e.source || '')})</span></li>`).join('') || '<li><span class="tick">-</span><span>ยังไม่มีสิทธิ์ที่ซื้อ (ใช้สัปดาห์ฟรีได้)</span></li>';
    res.innerHTML = `<div class="card"><h2>การเรียน</h2><ul class="list">${en}</ul><p class="small">เซสชันเต็มที่ทำแล้ว ${d.full_sessions} ครั้ง</p></div>
      <div class="card"><h2>สิทธิ์</h2><ul class="list">${ents}</ul></div>
      <div class="card"><h2>ให้สิทธิ์ฟรี / เพิกถอน</h2>
        <label class="field">สินค้า<select id="pr">${['cefr-b1', 'cefr-all', 'cefr-a2', 'cefr-b2', 'cefr-c1', 'cefr-c2'].map((p) => `<option value="${p}">${PRODUCT_TH[p]}</option>`).join('')}</select></label>
        <label class="field">จำนวนวัน (ให้สิทธิ์)<input id="days" type="number" min="1" max="730" value="30"></label>
        <label class="field">หมายเหตุ<input id="note" maxlength="200" placeholder="เช่น ทีมงาน / ชดเชย"></label>
        <div class="row"><button class="btn" id="grant">ให้สิทธิ์</button><button class="btn quiet" id="revoke">เพิกถอน</button></div><p class="small" id="gmsg"></p></div>`;
    const act = async (action) => {
      if (action === 'revoke' && !confirm('เพิกถอนสิทธิ์นี้ใช่ไหม')) return;
      const r = await call(action, { email, product: res.querySelector('#pr').value, days: Number(res.querySelector('#days').value), note: res.querySelector('#note').value });
      res.querySelector('#gmsg').textContent = r.ok ? 'บันทึกแล้ว' : `ไม่สำเร็จ (${r.error})`;
      if (r.ok) setTimeout(show, 600);
    };
    res.querySelector('#grant').onclick = () => act('grant');
    res.querySelector('#revoke').onclick = () => act('revoke');
  };
  main.querySelector('#find').onclick = show;
  em.onkeydown = (e) => { if (e.key === 'Enter') show(); };
}

async function orders(main) {
  const d = await call('orders');
  if (d.error) { main.innerHTML = fail(d); return; }
  main.innerHTML = d.orders.length ? d.orders.map((o) => `<div class="card"><div class="row"><b class="grow">${esc(PRODUCT_TH[o.product] || o.product)} · ${o.amount} บาท</b><span class="tag">${esc(o.status)}</span></div><p class="small">${thDate(o.created_at)}${o.paid_at ? ` · จ่าย ${thDate(o.paid_at)}` : ''}</p></div>`).join('') : '<p class="small">ยังไม่มีคำสั่งซื้อ (ระบบชำระเงินยังไม่เปิด)</p>';
}

const WHY_TH = { answer: 'เฉลยผิด', typo: 'พิมพ์ผิด', unclear: 'ไม่ชัด', audio: 'เสียง', other: 'อื่น ๆ' };
async function reports(main) {
  const d = await call('reports');
  if (d.error) { main.innerHTML = fail(d); return; }
  if (!d.reports.length) { main.innerHTML = '<p class="small">ไม่มีรายงานที่ค้างอยู่</p>'; return; }
  main.innerHTML = '';
  for (const r of d.reports) {
    const c = el(`<div class="card"><div class="row"><b class="grow">${esc(r.item_id)}</b><span class="tag">${esc(WHY_TH[r.why] || r.why)}</span></div>${r.note ? `<p>${esc(r.note)}</p>` : ''}<p class="small">${thDate(r.created_at)}</p><button class="btn quiet">ปิดรายงาน</button></div>`);
    c.querySelector('button').onclick = async () => { const x = await call('report_close', { id: r.id, resolution: 'ตรวจแล้ว' }); if (x.ok) c.remove(); };
    main.appendChild(c);
  }
}

async function log(main) {
  const d = await call('log');
  if (d.error) { main.innerHTML = fail(d); return; }
  main.innerHTML = d.log.length ? `<div class="card"><ul class="list">${d.log.map((l) => `<li><span class="tick">•</span><span><b>${esc(l.action)}</b> ${esc(JSON.stringify(l.detail || {})).slice(0, 160)}<br><small>${esc(l.actor)} · ${thDate(l.created_at)}</small></span></li>`).join('')}</ul></div>` : '<p class="small">ยังไม่มีประวัติ</p>';
}
const VIEWS = { overview, learner, orders, reports, log };

async function render() {
  const u = await authInit(() => render());
  if (!u) {
    app.innerHTML = `<div class="screen" id="view">${head().replace('<button class="link" id="out">ออกจากระบบ</button>', '')}<h1>แผงเจ้าของ</h1><p class="small">เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น</p><button class="btn" id="in">เข้าสู่ระบบด้วย Google</button></div>`;
    app.querySelector('#in').onclick = () => signIn();
    return;
  }
  const tab = location.hash.slice(1) || 'overview';
  app.innerHTML = `<div class="screen" id="view">${head()}<p class="small">${esc(currentUser().email || '')}</p><div class="chips" id="tabs">${TABS.map(([k, t]) => `<button class="chip${k === tab ? ' on' : ''}" data-t="${k}">${t}</button>`).join('')}</div><div class="screen" id="main"><p class="small">กำลังโหลด…</p></div></div>`;
  app.querySelector('#out').onclick = async () => { await signOut(); render(); };
  app.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('.chip'); if (b) location.hash = b.dataset.t; };
  await (VIEWS[tab] || overview)(app.querySelector('#main'));
}
window.addEventListener('hashchange', render);
render();
