// กดค้างที่คำภาษาอังกฤษ → คำแปลไทย + ชนิดคำ (n. v. adj. ...) · บอสขอ 22 พ.ย. 2569
// พจนานุกรม data/dict.json สร้างด้วย tools/make_dict.py (โหลดครั้งแรกที่กดค้าง) · รุ่นไฟล์เดียวฝังไว้ใน globalThis.DICT_DATA
// ล็อก: ส่วนที่อยู่ใต้ [data-nolookup] ไม่แปลให้ (ข้อคำศัพท์ที่ยังไม่ตอบ ชุดวัดผลระหว่างทำ) เพื่อไม่ให้ใช้แทนการตอบ
import { esc, say, canSay } from './items.js';

const POS_TH = { n: ['n.', 'คำนาม'], v: ['v.', 'คำกริยา'], adj: ['adj.', 'คำคุณศัพท์'], adv: ['adv.', 'คำวิเศษณ์'], prep: ['prep.', 'คำบุพบท'],
  conj: ['conj.', 'คำสันธาน'], pron: ['pron.', 'คำสรรพนาม'], det: ['det.', 'คำนำหน้านาม'], modal: ['modal', 'กริยาช่วยบอกท่าที'], aux: ['aux.', 'กริยาช่วย'],
  phrv: ['phr. v.', 'กริยาวลี'], int: ['int.', 'คำอุทาน'], num: ['num.', 'คำบอกจำนวน'], name: ['name', 'ชื่อเฉพาะ'], phr: ['phr.', 'วลี'], abbr: ['abbr.', 'คำย่อ'] };
const HOLD_MS = 480, MOVE_PX = 10;
let DICT = null, loading = null;

function load() {
  if (DICT) return Promise.resolve(DICT);
  if (globalThis.DICT_DATA) { DICT = globalThis.DICT_DATA.w; return Promise.resolve(DICT); }
  if (!loading) loading = fetch('data/dict.json').then((r) => (r.ok ? r.json() : null)).then((d) => { DICT = (d && d.w) || {}; return DICT; }).catch(() => { loading = null; return null; });
  return loading;
}

/** หาคำในพจนานุกรม: คำตรง → ตัดรูปผัน (-s -es -ies -ed -ing -er -est -ly 's) · คืน {w, pos, th, ex} หรือ null */
export function lookUp(dict, word) {
  const w = String(word || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z]+|[^a-z']+$/g, '');
  if (!w || !dict) return null;
  const t = [w];
  if (w.endsWith("'s")) t.push(w.slice(0, -2));
  if (w.endsWith('ies')) t.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) t.push(w.slice(0, -2), w.slice(0, -1)); else if (w.endsWith('s')) t.push(w.slice(0, -1));
  if (w.endsWith('ied')) t.push(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) t.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
  if (w.endsWith('ing')) t.push(w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -4));
  if (w.endsWith('ier')) t.push(w.slice(0, -3) + 'y'); else if (w.endsWith('er')) t.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith('iest')) t.push(w.slice(0, -4) + 'y'); else if (w.endsWith('est')) t.push(w.slice(0, -3), w.slice(0, -2));
  if (w.endsWith('ily')) t.push(w.slice(0, -3) + 'y'); else if (w.endsWith('ly')) t.push(w.slice(0, -2));
  for (const k of t) if (k.length > 1 && dict[k]) { const [pos, th, ex] = dict[k]; return { w: k, pos, th, ex }; }
  return null;
}

/** คำ (และคำถัดไป สำหรับกริยาวลี) ใต้นิ้ว · คืน {w, next} หรือ null */
function wordAt(x, y) {
  let n = null, o = 0;
  if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { n = c.offsetNode; o = c.offset; } }
  else if (document.caretRangeFromPoint) { const c = document.caretRangeFromPoint(x, y); if (c) { n = c.startContainer; o = c.startOffset; } }
  if (!n || n.nodeType !== 3) return null;
  const s = n.textContent, ok = (ch) => /[A-Za-z'’-]/.test(ch || '');
  let a = o, b = o;
  if (!ok(s[a]) && ok(s[a - 1])) a = b = o - 1;
  if (!ok(s[a])) return null;
  while (a > 0 && ok(s[a - 1])) a--; while (b < s.length && ok(s[b])) b++;
  const w = s.slice(a, b).replace(/^['’-]+|['’-]+$/g, '');
  const m = s.slice(b).match(/^\s+([A-Za-z]+)/);
  return /[A-Za-z]{2,}|^[aI]$/.test(w) ? { w, next: m ? m[1] : '' } : null;
}

function close() { const p = document.getElementById('wordPop'); if (p) p.remove(); }

function show(x, y, html, sayText) {
  close();
  const d = document.createElement('div');
  d.id = 'wordPop'; d.className = 'wpop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'คำแปล');
  d.innerHTML = html + `<div class="wp-row">${sayText && canSay() ? '<button type="button" class="btn quiet wp-say">ฟังเสียง</button>' : ''}<button type="button" class="btn quiet wp-x">ปิด</button></div>`;
  document.body.appendChild(d);
  d.querySelector('.wp-x').onclick = close;
  const sb = d.querySelector('.wp-say'); if (sb) sb.onclick = () => say(sayText, 0.85);
  const W = innerWidth, H = innerHeight, w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = Math.max(8, Math.min(W - w - 8, x - w / 2)) + 'px';
  d.style.top = (y + 28 + h > H - 8 ? Math.max(8, y - h - 20) : y + 28) + 'px';
}

async function pop(x, y, hit, locked) {
  if (locked) { show(x, y, `<b class="wp-w en">${esc(hit.w)}</b><p class="small">ดูคำแปลได้หลังตอบข้อนี้แล้ว</p>`, ''); return; }
  const dict = await load();
  if (!dict) { show(x, y, `<b class="wp-w en">${esc(hit.w)}</b><p class="small">โหลดพจนานุกรมไม่สำเร็จ ลองใหม่อีกครั้ง</p>`, ''); return; }
  const k2 = hit.next ? (hit.w + ' ' + hit.next).toLowerCase() : '';
  const two = k2 && dict[k2] ? { w: k2, pos: dict[k2][0], th: dict[k2][1], ex: dict[k2][2] } : null;
  const f = two || lookUp(dict, hit.w);
  if (!f) { show(x, y, `<b class="wp-w en">${esc(hit.w)}</b><p class="small">ยังไม่มีคำนี้ในพจนานุกรมของเรา</p>`, hit.w); return; }
  const shown = f.w === hit.w.toLowerCase() || two ? f.w : `${hit.w} → ${f.w}`;
  const tags = String(f.pos || '').split('/').filter(Boolean).map((p) => POS_TH[p] ? `<span class="wp-pos" title="${POS_TH[p][1]}"><b>${POS_TH[p][0]}</b> ${POS_TH[p][1]}</span>` : '').join('');
  show(x, y, `<b class="wp-w en">${esc(shown)}</b>${tags ? `<div class="wp-tags">${tags}</div>` : ''}<p class="wp-th">${esc(f.th)}</p>${f.ex ? `<p class="wp-ex en">${esc(f.ex)}</p>` : ''}`, f.w);
}

let installed = false;
/** ติดตั้งครั้งเดียวต่อหน้า · root = ส่วนของหน้าที่ให้กดค้างได้ */
export function installLookup(root = document.body) {
  if (installed) return; installed = true;
  let hold = null, swallow = false;
  const cancel = () => { if (hold) { clearTimeout(hold.t); hold = null; } };
  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('input,textarea,select,#wordPop')) return;
    if (!e.target.closest('#wordPop')) close();
    cancel(); swallow = false;
    const x = e.clientX, y = e.clientY, target = e.target;
    hold = { x, y, t: setTimeout(() => {
      hold = null;
      const hit = wordAt(x, y); if (!hit) return;
      swallow = true;
      pop(x, y, hit, !!target.closest('[data-nolookup]'));
      try { localStorage.setItem('cfk_lp_used', '1'); } catch { /* ไม่มีที่เก็บ */ }
    }, HOLD_MS) };
  }, { passive: true });
  root.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > MOVE_PX) cancel(); }, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'scroll']) root.addEventListener(ev, cancel, { passive: true, capture: ev === 'scroll' });
  // กดค้างแล้วปล่อยบนปุ่มตัวเลือก: ไม่ให้นับเป็นการเลือกคำตอบ
  root.addEventListener('click', (e) => { if (swallow) { swallow = false; if (!e.target.closest('#wordPop')) { e.preventDefault(); e.stopPropagation(); } } }, true);
  root.addEventListener('contextmenu', (e) => { if (swallow || wordAt(e.clientX, e.clientY)) e.preventDefault(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('hashchange', close);
}

/** ป้ายแนะนำครั้งแรก (แสดงจนกว่าจะเคยกดค้างสักครั้ง) */
export function lookupTip() {
  let used = false; try { used = localStorage.getItem('cfk_lp_used') === '1'; } catch { /* ไม่มีที่เก็บ */ }
  return used ? '' : '<p class="lp-tip">👆 กดค้างที่คำภาษาอังกฤษคำไหนก็ได้ เพื่อดูคำแปลและชนิดคำ (n. v. adj.)</p>';
}
