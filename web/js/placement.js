// หน้าวัดระดับฟรี /placement.html · ไม่ต้องล็อกอิน · ไม่แสดงเฉลยระหว่างทำ (เฉลยไม่ลงเบราว์เซอร์ในเว็บจริง)
// บันไดขั้น 3 ใน docs/cefr/08_marketing.md · ผลเป็นการประเมินคร่าว ๆ เพื่อเลือกคอร์ส ไม่ใช่การรับรองระดับ
import { api } from './api.js';
import { el, esc } from './items.js';
import { SITE, OPEN_COURSES } from './config.js';

const app = document.getElementById('app');
const BAND = { a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1', c2: 'C2' };
const SKILL = { gm: 'ไวยากรณ์', vo: 'คำศัพท์', rd: 'การอ่าน', dlg: 'บทสนทนา', li: 'การฟัง' };
const head = () => `<div class="topbar"><span class="brand">${esc(SITE.brand)}</span><span class="small">by TAYAK</span></div>`;
let src = null;
try { src = localStorage.getItem('cfk_src_post'); } catch (e) { /* ไม่จำที่มา */ }

function intro(items, minutes) {
  const n = items.reduce((a, it) => a + (it.questions ? it.questions.length : 1), 0);
  app.innerHTML = '';
  const v = el(`<div class="screen" id="view">${head()}
    <h1>วัดระดับภาษาอังกฤษฟรี</h1>
    <div class="card"><ul class="list">
      <li><span class="tick">✓</span><span>${n} ข้อ ใช้เวลาประมาณ ${minutes} นาที</span></li>
      <li><span class="tick">✓</span><span>ไม่ต้องสมัคร รู้ผลทันทีเมื่อทำครบ</span></li>
      <li><span class="tick">✓</span><span>ข้อจะยากขึ้นเรื่อย ๆ ตอบไม่ได้ให้เลือกข้อที่คิดว่าใช่ที่สุด</span></li>
      <li><span class="tick">✓</span><span>ผลบอกช่วงระดับโดยประมาณ ทักษะที่ควรฝึก และคอร์สที่เหมาะ</span></li>
    </ul></div>
    <p class="small">ผลเป็นการประเมินคร่าว ๆ เพื่อเลือกคอร์ส ไม่ใช่การรับรองระดับภาษา</p>
    <button class="btn" id="start">เริ่มทำ</button>
    <div class="card skipbox"><h2>ไม่อยากทำแบบทดสอบ?</h2><p class="small">เข้าไปลองเรียนได้เลย เริ่มที่คอร์ส B1 สัปดาห์แรกฟรีทั้งสัปดาห์ จะกลับมาวัดระดับทีหลังก็ได้</p>
      <a class="btn quiet" id="skipTest" href="app.html">ลองเรียนเลย ไม่ทำแบบทดสอบ</a></div></div>`);
  v.querySelector('#start').onclick = () => run(items);
  app.appendChild(v);
}

function run(items) {
  const answers = {};
  const total = items.reduce((a, it) => a + (it.questions ? it.questions.length : 1), 0);
  let i = 0;
  const done = () => Object.keys(answers).length;
  const show = () => {
    const it = items[i];
    app.innerHTML = '';
    const v = el(`<div class="screen" id="view">
      <div class="topbar"><span class="small">ข้อ ${Math.min(done() + 1, total)} จาก ${total}</span><span class="small">ระดับ ${BAND[it.band] || ''}</span></div>
      <div class="steps" style="grid-template-columns:repeat(${total},1fr)">${Array.from({ length: total }, (_, k) => `<i class="${k < done() ? 'on' : ''}"></i>`).join('')}</div></div>`);
    if (it.kind === 'read') v.appendChild(el(`<div class="card">${it.title ? `<h2 class="en">${esc(it.title)}</h2>` : ''}<div class="en box">${String(it.passage).trim().split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join('')}</div></div>`));
    // รูปแบบคีย์ต้องตรงกับตัวตรวจ: ข้อที่มีคำถามเดียวใช้รหัสข้อเฉย ๆ (grade.mjs / exam-api placement_grade)
    const qs = it.questions ? it.questions.map((q, n) => ({ key: it.questions.length > 1 ? `${it.id}:${n}` : it.id, stem: q.stem, choices: q.choices })) : [{ key: it.id, stem: it.stem, choices: it.choices }];
    qs.forEach((q) => {
      const box = el(`<div class="card" data-q="${esc(q.key)}"><p class="en">${esc(q.stem)}</p></div>`);
      q.choices.forEach((c, n) => {
        const b = el(`<button class="opt${answers[q.key] === n ? ' sel' : ''}" data-choice="${n}"><b>${n + 1}</b><span>${esc(c.t)}</span></button>`);
        b.onclick = () => { answers[q.key] = n; box.querySelectorAll('.opt').forEach((o) => o.classList.toggle('sel', o === b)); next.disabled = !qs.every((x) => x.key in answers); };
        box.appendChild(b);
      });
      v.appendChild(box);
    });
    const next = el(`<button class="btn" id="next" ${qs.every((x) => x.key in answers) ? '' : 'disabled'}>${i + 1 < items.length ? 'ข้อต่อไป' : 'ส่งคำตอบและดูผล'}</button>`);
    next.onclick = () => { if (i + 1 < items.length) { i++; show(); window.scrollTo(0, 0); } else finish(answers); };
    v.appendChild(next);
    if (i > 0) v.appendChild(Object.assign(el('<button class="link" id="back">ย้อนกลับข้อก่อน</button>'), { onclick: () => { i--; show(); } }));
    app.appendChild(v);
  };
  show();
}

async function finish(answers) {
  app.innerHTML = `<div class="screen" id="view">${head()}<p>กำลังตรวจคำตอบ…</p></div>`;
  const r = await api.placementGrade(answers, src);
  if (!r || !r.result) { app.innerHTML = `<div class="screen" id="view">${head()}<div class="note">ส่งคำตอบไม่สำเร็จ (${esc(r && r.error || 'error')}) ลองใหม่อีกครั้ง</div><button class="btn" id="retry">ส่งอีกครั้ง</button></div>`; app.querySelector('#retry').onclick = () => finish(answers); return; }
  result(r.result);
}

function result(R) {
  const lvl = R.level.startsWith('below-') ? `ยังไม่ถึง ${BAND[R.level.slice(6)]}` : `${BAND[R.level]} ${R.position === 'high' ? 'ช่วงบน' : 'ช่วงล่าง'}`;
  const plan = (R.plan || []).map((c) => BAND[c]).join(' แล้วต่อ ');
  const skills = Object.entries(R.by_skill || {}).map(([k, [c, n]]) => `<div class="skill"><span>${SKILL[k] || k}</span><div class="bar"><span style="width:${Math.round(100 * c / n)}%"></span></div><small>${c}/${n}</small></div>`).join('');
  // คอร์สที่เปิดแล้วซึ่งใกล้ผลที่สุด: a2 → b1 · b2 → b1 (ทบทวนให้แน่น) และเสนอ c1 เป็นทางเลือก · c2 → c1
  const first = (R.plan || ['b1'])[0], NEAR = { a2: 'b1', b1: 'b1', b2: 'b1', c1: 'c1', c2: 'c1' };
  const go = OPEN_COURSES.includes(first) ? first : (NEAR[first] || 'b1'), other = first === 'b2' ? 'c1' : null;
  const weak = Object.entries(R.by_skill || {}).filter(([, [c, n]]) => n && c / n < 0.6).map(([k]) => SKILL[k] || k);
  app.innerHTML = '';
  const v = el(`<div class="screen" id="view" data-level="${esc(R.level)}" data-scores="${esc(JSON.stringify(R.scores || {}))}">${head()}
    <h1>ผลวัดระดับของคุณ</h1>
    <div class="card"><p class="small">ระดับโดยประมาณ</p><p class="price" id="level">${esc(lvl)}</p>${R.borderline ? '<p class="small">ผลอยู่ใกล้เส้นแบ่งระหว่างสองระดับ</p>' : ''}
      <p>คอร์สที่แนะนำ: <b id="plan">${esc(plan)}</b></p></div>
    <div class="card"><h2>แยกตามทักษะ</h2>${skills}${weak.length ? `<p class="small">ควรฝึกก่อน: ${esc(weak.join(' · '))}</p>` : ''}</div>
    <div class="card"><h2>ขั้นต่อไป</h2><p>เรียนสัปดาห์แรกของคอร์ส ${esc(BAND[go])} ฟรีทั้งสัปดาห์ วันละประมาณ 20 นาที</p>
      <a class="btn" id="startCourse" href="app.html?course=${esc(go)}">เริ่มเรียนคอร์ส ${esc(BAND[go])} สัปดาห์แรกฟรี</a>
      ${go !== first ? `<p class="small">คอร์ส ${esc(BAND[first] || '')} ยังไม่เปิด ตอนนี้แนะนำคอร์ส ${esc(BAND[go])} ซึ่งใกล้ระดับของคุณที่สุด${other ? ` หรือ <a href="app.html?course=${esc(other)}" id="otherCourse">ลองคอร์ส ${esc(BAND[other])}</a>` : ''}</p>` : ''}
      <p class="small">ตอนนี้เปิดคอร์ส ${OPEN_COURSES.map((c) => BAND[c]).join(' และ ')} คอร์สระดับอื่นทยอยเปิดตามลำดับ</p></div>
    <p class="small">ผลนี้เป็นการประเมินคร่าว ๆ จากแบบวัด 25 ข้อเพื่อช่วยเลือกคอร์ส ไม่ใช่การรับรองระดับภาษาและไม่ได้บอกผลสอบจริง</p>
    <button class="btn quiet" id="again">ทำอีกครั้ง</button></div>`);
  v.querySelector('#again').onclick = () => start();
  app.appendChild(v);
}

async function start() {
  app.innerHTML = `<div class="screen" id="view">${head()}<p>กำลังโหลด…</p></div>`;
  const r = await api.placementItems();
  if (!r || !r.items || !r.items.length) { app.innerHTML = `<div class="screen" id="view">${head()}<div class="note">ยังเปิดแบบวัดระดับไม่ได้ในขณะนี้ ลองใหม่ภายหลัง</div></div>`; return; }
  intro(r.items, r.time_min || 20);
}
start();
