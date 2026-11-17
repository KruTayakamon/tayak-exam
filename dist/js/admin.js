// แผงเจ้าของ /admin · เฉพาะอีเมลที่อยู่ใน secret EXAM_OWNER_EMAILS (ตรวจที่เซิร์ฟเวอร์ exam-admin ทุกคำขอ · หน้านี้ไม่ได้ตัดสินสิทธิ์เอง)
// สเปก docs/cefr/06_owner_panel.md · รอบแรก (17 พ.ย. 2569): ภาพรวม · ผู้เรียน (ดู/ให้สิทธิ์ฟรี/เพิกถอน) · คำสั่งซื้อ · รายงานข้อ · ประวัติการกระทำ
import { el, esc, rich, keepBox } from './items.js';
import { SITE } from './config.js';
import { authInit, signIn, signOut, currentUser, currentToken } from './auth.js';

const app = document.getElementById('app');
const TABS = [['overview', 'ภาพรวม'], ['posts', 'โพสต์'], ['content', 'เนื้อหา'], ['learner', 'ผู้เรียน'], ['orders', 'คำสั่งซื้อ'], ['reports', 'รายงานข้อ'], ['log', 'ประวัติ']];
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
// ---------- เนื้อหา: อนุมัติรายสัปดาห์ (มติบอส 17 พ.ย. รอบ 20) ----------
// ผู้เรียนเห็นเฉพาะสัปดาห์ที่ผังเป็น approved และเฉพาะข้อที่ approved · Claude นำเนื้อหาใหม่เข้าเป็น draft แล้วบอสกดอนุมัติที่นี่
const ST_TH = { approved: 'อนุมัติแล้ว', draft: 'ร่าง รอตรวจ', retired: 'ถอดออก' };
const KIND_TH = { mcq: 'เลือกตอบ', type: 'พิมพ์คำ', order: 'เรียงประโยค', cloze: 'เติมช่องว่าง', read: 'อ่าน', listen: 'ฟัง' };
const stTag = (st) => `<span class="tag st-${esc(st)}">${esc(ST_TH[st] || st)}</span>`;
function itemPreview(b) {
  const ch = (cs, ans) => cs.map((c, i) => `<p class="${i === ans ? 'ck-ok' : ''}"><b>${i === ans ? '✓' : i + 1}</b> <span class="en">${esc(c.t)}</span>${c.why ? `<br><small>${rich(c.why)}</small>` : ''}</p>`).join('');
  let h = '';
  if (b.passage) h += `<div class="en box">${esc(String(b.passage)).slice(0, 600)}${String(b.passage).length > 600 ? '…' : ''}</div>`;
  if (b.text) h += `<div class="en box"><pre>${esc(b.text)}</pre></div>`;
  if (b.script) h += `<div class="en box">${b.script.map((l) => `<p><b>${esc(l.who)}:</b> ${esc(l.en)}</p>`).join('')}</div>`;
  if (b.stem) h += `<p class="en">${esc(b.stem)}</p>`;
  if (b.kind === 'mcq') h += ch(b.choices, b.answer);
  if (b.kind === 'type') h += `<p class="ck-ok"><b>✓</b> <span class="en">${esc(b.answer)}</span></p>`;
  if (b.kind === 'order') h += `<p class="ck-ok"><b>✓</b> <span class="en">${esc(b.sentence)}</span></p><p class="small">${esc(b.th || '')}</p>`;
  for (const [n, q] of (b.questions || []).entries()) h += `<p class="small"><b>คำถาม ${n + 1}</b> ${q.stem ? `<span class="en">${esc(q.stem)}</span>` : ''}</p>` + ch(q.choices, q.answer);
  if (b.why) h += `<p class="small">${rich(b.why)}</p>`;
  if (b.explain) h += keepBox(b.explain);
  return h;
}
async function content(main) {
  const course = sessionStorage.getItem('adm_course') || 'b1';
  main.innerHTML = `<div class="chips" id="crs">${['a2', 'b1', 'b2', 'c1', 'c2'].map((c) => `<button class="chip${c === course ? ' on' : ''}" data-c="${c}">${c.toUpperCase()}</button>`).join('')}</div><div id="wk" class="screen"><p class="small">กำลังโหลด…</p></div>`;
  main.querySelector('#crs').onclick = (e) => { const b = e.target.closest('.chip'); if (b) { try { sessionStorage.setItem('adm_course', b.dataset.c); } catch { /* */ } content(main); } };
  const box = main.querySelector('#wk');
  const d = await call('weeks_list', { course });
  if (d.error) { box.innerHTML = fail(d); return; }
  if (!d.weeks.length) { box.innerHTML = `<div class="note">คอร์ส ${course.toUpperCase()} ยังไม่มีเนื้อหาในระบบ (Claude จะนำเข้าเป็นร่างเมื่อเขียนเสร็จ)</div>`; return; }
  box.innerHTML = '<p class="small">แตะสัปดาห์เพื่อตรวจ ผู้เรียนเห็นเฉพาะสัปดาห์และข้อที่ "อนุมัติแล้ว"</p>';
  for (const w of d.weeks) {
    const c = el(`<button class="card wkrow" data-w="${w.week}"><div class="row"><b class="grow">สัปดาห์ ${w.week} · ${esc(w.body?.theme_th || '')}</b>${stTag(w.status)}</div><span class="small">แก้ล่าสุด ${thDate(w.updated_at)}</span></button>`);
    c.onclick = () => week(box, course, w);
    box.appendChild(c);
  }
}
async function week(box, course, w) {
  box.innerHTML = '<p class="small">กำลังโหลดข้อ…</p>';
  const d = await call('content_list', { course, week: w.week });
  if (d.error) { box.innerHTML = fail(d); return; }
  const items = d.items, nApp = items.filter((i) => i.status === 'approved').length;
  const sess = (w.body?.sessions || []).map((s) => `<li><span class="tick">${s.day}</span><span>${esc(s.title_th || '')}${s.lesson ? `<br><small>${rich(s.lesson.rule_th || '')}</small>` : ''}</span></li>`).join('');
  box.innerHTML = `<button class="link" id="back">← กลับรายการสัปดาห์</button>
    <div class="card"><div class="row"><h2 class="grow">สัปดาห์ ${w.week} · ${esc(w.body?.theme_th || '')}</h2>${stTag(w.status)}</div>
      <p class="small">ข้ออนุมัติแล้ว ${nApp} จาก ${items.length} ข้อ</p><ul class="list">${sess}</ul>
      <button class="btn" id="apAll">อนุมัติทั้งสัปดาห์ (ผังบทเรียน + ทุกข้อ)</button>
      <button class="btn quiet" id="toDraft">ส่งกลับเป็นร่างทั้งสัปดาห์ (ผู้เรียนจะไม่เห็น)</button><p class="small" id="wmsg"></p></div>
    <div class="chips"><button class="chip" id="selAll">เลือกทุกข้อ</button><button class="chip" id="apSel">✓ อนุมัติข้อที่เลือก</button><button class="chip" id="rtSel">✕ ถอดข้อที่เลือก</button></div>
    <div id="its" class="screen"></div>`;
  const its = box.querySelector('#its');
  for (const it of items) {
    its.appendChild(el(`<details class="card itrow"><summary><label class="check" onclick="event.stopPropagation()"><input type="checkbox" value="${esc(it.id)}"></label><span class="grow"><b>${esc(it.id.split('-').pop())} · ${esc(KIND_TH[it.kind] || it.kind)}</b><br><small>${esc(it.topic)}</small></span>${stTag(it.status)}</summary><div class="screen">${itemPreview(it.body || {})}</div></details>`));
  }
  const msg = box.querySelector('#wmsg');
  const reload = async () => { const x = await call('weeks_list', { course }); week(box, course, (x.weeks || []).find((y) => y.week === w.week) || w); };
  const setItems = async (ids, status) => (ids.length ? call('content_status', { ids, status }) : { ok: true });
  box.querySelector('#back').onclick = () => content(box.parentElement);
  box.querySelector('#apAll').onclick = async () => {
    if (!confirm(`อนุมัติสัปดาห์ ${w.week} ทั้งหมด? ผู้เรียนจะเห็นทันที`)) return;
    msg.textContent = 'กำลังบันทึก…';
    const a = await setItems(items.filter((i) => i.status !== 'retired').map((i) => i.id), 'approved'), b = await call('week_status', { course, week: w.week, status: 'approved' });
    msg.textContent = a.ok && b.ok ? 'อนุมัติแล้ว' : `ไม่สำเร็จ (${a.error || b.error})`; if (a.ok && b.ok) reload();
  };
  box.querySelector('#toDraft').onclick = async () => {
    if (!confirm(`ส่งสัปดาห์ ${w.week} กลับเป็นร่าง? ผู้เรียนที่อยู่สัปดาห์นี้จะเรียนต่อไม่ได้จนกว่าจะอนุมัติใหม่`)) return;
    const b = await call('week_status', { course, week: w.week, status: 'draft' });
    msg.textContent = b.ok ? 'ส่งกลับเป็นร่างแล้ว' : `ไม่สำเร็จ (${b.error})`; if (b.ok) reload();
  };
  const sel = () => [...its.querySelectorAll('input:checked')].map((x) => x.value);
  box.querySelector('#selAll').onclick = () => { const all = its.querySelectorAll('input'); const on = [...all].some((x) => !x.checked); all.forEach((x) => { x.checked = on; }); };
  box.querySelector('#apSel').onclick = async () => { const ids = sel(); if (!ids.length) return; const r = await setItems(ids, 'approved'); if (r.ok) reload(); else alert(r.error); };
  box.querySelector('#rtSel').onclick = async () => { const ids = sel(); if (!ids.length || !confirm(`ถอด ${ids.length} ข้อออก? ผู้เรียนจะไม่เห็นข้อนี้อีก`)) return; const r = await setItems(ids, 'retired'); if (r.ok) reload(); else alert(r.error); };
}
// ---------- โพสต์เฟซบุ๊ก: รูป + แคปชันพร้อมแฮชแท็ก กดคัดลอกแล้ววางได้เลย (มติบอส 17 พ.ย. รอบ 21) ----------
// ข้อมูลจาก p/posts.json (build.py สร้างจากโพสต์ที่อนุมัติแล้ว) · "โพสต์แล้ว" จำไว้ในเครื่องนี้
const TYPE_TH = { quiz: 'โจทย์', word: 'คำศัพท์', trap: 'จุดพลาด', class: 'ประโยคพร้อมใช้', tip: 'เทคนิค', recap: 'สรุปสัปดาห์' };
const postedGet = () => { try { return new Set(JSON.parse(localStorage.getItem('adm_posted') || '[]')); } catch { return new Set(); } };
const postedSet = (s) => { try { localStorage.setItem('adm_posted', JSON.stringify([...s])); } catch { /* ไม่มีที่เก็บ */ } };
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* เบราว์เซอร์เก่า: ใช้วิธีเลือกข้อความ */ }
  const ta = el('<textarea style="position:fixed;opacity:0"></textarea>'); ta.value = t; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
}
async function posts(main) {
  const r = await fetch('p/posts.json', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!r || !r.posts?.length) { main.innerHTML = '<div class="note">ยังไม่มีโพสต์ที่อนุมัติแล้ว</div>'; return; }
  const done = postedGet();
  main.innerHTML = `<p class="small">กด <b>คัดลอกแคปชัน</b> แล้ววางในเฟซบุ๊กได้เลย (มีลิงก์และแฮชแท็กครบ) · รูปกด <b>บันทึกรูป</b> หรือกดค้างที่รูปเพื่อบันทึก · ติ๊ก "โพสต์แล้ว" เพื่อจำว่าลงไปแล้ว</p>`;
  for (const p of r.posts) {
    const c = el(`<div class="card post${done.has(p.id) ? ' done' : ''}">
      <div class="row"><b class="grow">${esc(TYPE_TH[p.type] || p.type)} · ${esc(p.head)}</b><label class="check"><input type="checkbox" class="pd" ${done.has(p.id) ? 'checked' : ''}><span>โพสต์แล้ว</span></label></div>
      ${p.img ? `<img class="postimg" src="${esc(p.img)}" alt="รูปโพสต์ ${esc(p.id)}" loading="lazy">` : '<p class="small">ยังไม่มีรูป</p>'}
      <div class="row">${p.img ? `<a class="btn quiet" href="${esc(p.img)}" download="${esc(p.id)}.png">บันทึกรูป</a>` : ''}<button class="btn cp-cap">คัดลอกแคปชัน</button></div>
      <pre class="cap">${esc(p.caption)}</pre>
      <p class="small"><b>คอมเมนต์แรก</b> (วางใต้โพสต์ ให้คนกดลิงก์ได้ง่าย)</p><pre class="cap">${esc(p.comment)}</pre>
      <div class="row"><button class="btn quiet cp-com">คัดลอกคอมเมนต์แรก</button><a class="btn quiet" href="${esc(p.link)}" target="_blank" rel="noopener">เปิดหน้าโพสต์</a></div></div>`);
    const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => { b.textContent = o; }, 1500); };
    c.querySelector('.cp-cap').onclick = async (e) => flash(e.target, (await copyText(p.caption)) ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่ได้ กดค้างที่ข้อความแทน');
    c.querySelector('.cp-com').onclick = async (e) => flash(e.target, (await copyText(p.comment)) ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่ได้ กดค้างที่ข้อความแทน');
    c.querySelector('.pd').onchange = (e) => { const s = postedGet(); if (e.target.checked) s.add(p.id); else s.delete(p.id); postedSet(s); c.classList.toggle('done', e.target.checked); };
    main.appendChild(c);
  }
}
const VIEWS = { overview, posts, content, learner, orders, reports, log };

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
