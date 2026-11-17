// หน้าเว็บของโพสต์เพจ /p/<รหัส>/ · ข้อมูลโพสต์ฝังอยู่ในหน้า (โพสต์เป็นของสาธารณะ เฉลยอยู่บนหน้าได้)
// ไม่ต้องสมัคร: ตอบข้อเดียวกับในภาพ → ชุดสั้น 4–5 ข้อ → ชวนวัดระดับฟรี (บันไดขั้น 1–3 ใน docs/cefr/08_marketing.md)
import { el, esc, notesHtml, spk, renderItem } from './items.js';

const P = JSON.parse(document.getElementById('post-data').textContent);
const app = document.getElementById('app');
const ROOT = '../../';
const NEXT = ROOT + String(P.placement_path || 'app.html').replace(/^\//, '');
try { localStorage.setItem('cfk_src_post', localStorage.getItem('cfk_src_post') || P.id); } catch (e) { /* โหมดส่วนตัว: ไม่จำที่มา */ }

const head = el(`<header class="screen"><p class="small"><b>CEFR for Kru</b> by TAYAK · ระดับ ${esc(P.course.toUpperCase())}</p><h1>${esc(P.head)}</h1></header>`);
app.appendChild(head);

const sp = (t) => `<span data-say="${esc(t)}"></span>`;          // ที่วางปุ่มลำโพง (spk คืน element จึงต่อทีหลังด้วย wire)
const wire = (node) => { node.querySelectorAll('[data-say]').forEach((x) => { const b = spk(x.dataset.say); if (b) x.replaceWith(b); else x.remove(); }); return node; };
const lines = (ls) => (ls || []).map((l) => `<div class="row" style="align-items:flex-start"><div style="flex:1"><p class="en">${esc(l.en)}</p><p class="small">${esc(l.th)}</p></div>${sp(l.en)}</div>`).join('');
const note = (s) => (s ? notesHtml([{ kind: 'pin', th: s }]) : '');             // โน้ตแปะแบบเดียวกับบทเรียนในแอป

function cta(score) {
  const box = el(`<section class="card screen" id="cta">${score ? `<p><b>ได้ ${score[0]} จาก ${score[1]} ข้อ</b></p>` : ''}
    <h2>อยากรู้ว่าตอนนี้อยู่ระดับไหน</h2>
    <p>วัดระดับฟรี 25 ข้อ ใช้เวลาประมาณ 20 นาที ไม่ต้องสมัคร รู้ผลทันทีว่าทักษะไหนต้องฝึก แล้วเริ่มเรียนสัปดาห์แรกฟรีทั้งสัปดาห์</p>
    <a class="btn" id="goPlacement" href="${esc(NEXT)}">วัดระดับฟรี</a>
    <p class="small">ผลเป็นการประเมินคร่าว ๆ เพื่อเลือกคอร์ส ไม่ใช่การรับรองระดับภาษา</p></section>`);
  app.appendChild(box);
}

function runSet(items, i = 0, right = 0) {
  if (i >= items.length) { cta([right, items.length]); return; }
  const card = el(`<section class="card screen" data-set="${i + 1}"><p class="small">ข้อ ${i + 1} จาก ${items.length}</p><div class="screen"></div></section>`);
  app.appendChild(card);
  renderItem(card.lastElementChild, items[i], (r) => {
    const ok = r.answers.every((a) => a.correct);
    const b = el(`<button class="btn next" type="button">${i + 1 < items.length ? 'ข้อต่อไป' : 'ดูผล'}</button>`);
    b.addEventListener('click', () => { b.remove(); runSet(items, i + 1, right + (ok ? 1 : 0)); });
    card.appendChild(b); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  card.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function moreButton(label) {
  if (!P.more.length) { cta(); return; }
  const b = el(`<button class="btn" id="moreBtn" type="button">${esc(label)}</button>`);
  b.addEventListener('click', () => { b.remove(); runSet(P.more); });
  app.appendChild(b);
}

if (P.type === 'quiz') {
  const card = el('<section class="card screen"><p class="small">ตอบข้อเดียวกับในโพสต์ แตะแล้วเห็นเหตุผลของทุกตัวเลือก</p><div class="screen" id="q0"></div></section>');
  app.appendChild(card);
  renderItem(card.querySelector('#q0'), P.item, () => moreButton(`ลองอีก ${P.more.length} ข้อเรื่องนี้ (2 นาที)`));
} else {
  let h = '';
  if (P.type === 'word') h = `<div class="row" style="align-items:center"><div style="flex:1"><p class="en" style="font-size:1.6rem"><b>${esc(P.word)}</b> <span class="small">${esc(P.pos)}</span></p><p><b>${esc(P.th)}</b></p></div>${sp(P.word)}</div>${lines([{ en: P.example, th: P.example_th }])}`;
  if (P.type === 'trap') h = `<div class="fb bad"><b>พูดแบบนี้กันบ่อย</b><span class="en">${esc(P.wrong)}</span></div><div class="fb ok"><b>ที่ถูกคือ</b><div class="row" style="align-items:center"><span class="en" style="flex:1">${esc(P.right)}</span>${sp(P.right)}</div></div>${note(P.note)}`;
  if (P.type === 'class') h = lines(P.lines);
  if (P.type === 'tip') h = note(P.note) + lines(P.lines);
  if (P.type === 'recap') h = note(P.note);
  app.appendChild(wire(el(`<section class="card screen">${h}</section>`)));
  if (P.type === 'recap') cta(); else moreButton(`ฝึกต่อ ${P.more.length} ข้อ (2 นาที)`);
}
