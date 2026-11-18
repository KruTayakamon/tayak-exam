// ชุดวัดผล 3 ครั้งต่อคอร์ส (docs/cefr/03_learning_engine.md ข้อ 5.3 · course/cefr/_assessment.yaml checkpoint)
// 40 คะแนน 40 นาที · ระหว่างทำไม่มีเฉลยในเครื่อง ส่งทั้งชุดแล้วเซิร์ฟเวอร์ตรวจและคืนเฉลยพร้อมเหตุผล
// ครั้งที่ n เปิดเมื่อถึงสัปดาห์ 4n (หรือจบคอร์ส) และทำครั้งก่อนแล้ว · เฉพาะผู้ซื้อคอร์ส (access.checkpoint)
import { api } from './api.js';
import { el, esc, say, rich, keepBox } from './items.js';
import { load, save, drop } from './store.js';

const SKILL_TH = { gm: 'ไวยากรณ์', vo: 'คำศัพท์', rd: 'การอ่าน', li: 'การฟัง' };
const keyOf = (it, q) => (it.questions && it.questions.length > 1 ? `${it.id}:${q}` : it.id);
const ptsOf = (it) => (it.questions ? it.questions.length : 1);

/** สถานะชุดวัดผลจากข้อมูลหน้า home · คืน [{n, state: done|open|locked|later, score, week}] */
export function cpStates(h) {
  const done = Object.fromEntries((h.checkpoints || []).map((c) => [c.n, c]));
  const wk = h.pointer ? h.pointer.week : 1, fin = !!(h.pointer && h.pointer.done);
  return [1, 2, 3].map((n) => {
    if (done[n]) return { n, state: 'done', score: done[n].score, week: 4 * n };
    const reached = fin || wk >= 4 * n, prevDone = n === 1 || !!done[n - 1];
    return { n, state: reached && prevDone ? 'open' : reached ? 'later' : 'locked', week: 4 * n };
  });
}

/** การ์ดชุดวัดผลสำหรับหน้า ผล และหน้า วันนี้ (onlyOpen = แสดงเฉพาะเมื่อมีชุดที่เปิดอยู่) */
export function cpCard(h, onlyOpen = false) {
  const paid = !!(h.access && h.access.checkpoint);
  const st = cpStates(h), open = st.find((x) => x.state === 'open');
  if (onlyOpen) return paid && open ? `<div class="card cpcard" id="cpOpen"><h2>📝 ชุดวัดผลครั้งที่ ${open.n} เปิดแล้ว</h2><p class="small">40 ข้อ 40 นาที ดูว่าทำได้กี่คะแนนเมื่อเทียบกับทั้งคอร์ส</p><a class="btn" href="#cp-${open.n}">ไปทำชุดวัดผล</a></div>` : '';
  const rows = st.map((x) => {
    const right = x.state === 'done' ? `<b class="cpscore">${x.score.total}/${x.score.max}</b>`
      : x.state === 'open' && paid ? `<a class="btn small-btn" href="#cp-${x.n}" id="cpGo${x.n}">ทำเลย</a>`
        : x.state === 'later' ? '<small>ทำครั้งก่อนให้เสร็จก่อน</small>' : `<small>เปิดเมื่อถึงสัปดาห์ ${x.week}</small>`;
    return `<div class="row cprow" data-cp="${x.n}" style="justify-content:space-between"><span>ครั้งที่ ${x.n} <small>(สัปดาห์ ${x.week})</small></span>${right}</div>`;
  }).join('');
  const done = st.filter((x) => x.state === 'done');
  const trend = done.length >= 2 ? `<p class="small" id="cpTrend">เพิ่มขึ้น ${done[done.length - 1].score.total - done[0].score.total} คะแนนจากครั้งแรก</p>` : '';
  return `<div class="card" id="cpCard"><h2>ชุดวัดผล</h2>${rows}${trend}${paid ? '' : '<p class="small">ชุดวัดผลเปิดให้ผู้ที่ซื้อคอร์ส <a href="#buy">ดูราคา</a></p>'}<p class="small">ทุกครั้งครอบคลุมทั้ง 12 สัปดาห์ เพื่อเทียบได้ว่าเก่งขึ้นเท่าไร ไม่ใช่การรับรองระดับภาษา</p></div>`;
}

const KEY = (n) => 'cfk-cp-' + n;

export async function viewCheckpoint(root, go, n) {
  const h = await api.home();
  const st = h && !h.error ? cpStates(h).find((x) => x.n === n) : null;
  root.innerHTML = '';
  if (!st || !h.access || !h.access.checkpoint) { root.appendChild(el('<div class="note">ชุดวัดผลเปิดให้ผู้ที่ซื้อคอร์ส</div>')); root.appendChild(Object.assign(el('<a class="btn" href="#buy">ดูราคาคอร์ส</a>'))); return; }
  if (st.state === 'done') { root.appendChild(el(`<div class="note">ทำชุดวัดผลครั้งที่ ${n} แล้ว ได้ ${st.score.total}/${st.score.max} คะแนน</div>`)); root.appendChild(Object.assign(el('<button class="btn quiet">ดูผลทั้งหมด</button>'), { onclick: () => go('results') })); return; }
  if (st.state !== 'open') { root.appendChild(el(`<div class="note">ชุดวัดผลครั้งที่ ${n} ยังไม่เปิด</div>`)); return; }
  const saved = load(KEY(n), null);
  root.appendChild(el(`<div><h1>ชุดวัดผลครั้งที่ ${n}</h1>
    <div class="card"><ul class="list">
      <li><span class="tick">✓</span><span>40 คะแนน เวลา 40 นาที ทำรวดเดียวจนจบ</span></li>
      <li><span class="tick">✓</span><span>ชุดนี้มีเรื่องที่ยังไม่ได้เรียน เพื่อให้เห็นว่าเพิ่มขึ้นเท่าไรเมื่อจบคอร์ส ครั้งแรกได้น้อยเป็นเรื่องปกติ</span></li>
      <li><span class="tick">✓</span><span>ระหว่างทำจะยังไม่เห็นเฉลย ส่งแล้วจึงเห็นคะแนน เฉลย และเหตุผลทุกข้อ</span></li>
      <li><span class="tick">✓</span><span>มีข้อฟัง 4 ข้อ ใช้หูฟังหรืออยู่ในที่เปิดเสียงได้</span></li>
      <li><span class="tick">✓</span><span>ส่งได้ครั้งเดียว ตอบไม่ได้ให้เลือกข้อที่คิดว่าใช่ที่สุด</span></li></ul></div>
    <p class="small">ผลเป็นการประเมินจากแบบฝึกของเรา ไม่ใช่การรับรองระดับภาษาและไม่ได้บอกผลสอบจริง</p></div>`));
  const b = el(`<button class="btn" id="cpStart">${saved ? 'ทำต่อจากที่ค้าง' : 'เริ่มทำ'}</button>`);
  b.onclick = async () => {
    b.disabled = true; b.textContent = 'กำลังโหลด…';
    const r = await api.checkpointStart(n).catch(() => null);
    if (!r || !r.items) { root.appendChild(el(`<div class="note">เปิดชุดวัดผลไม่ได้ (${esc((r && r.error) || 'error')}) ลองใหม่อีกครั้ง</div>`)); b.disabled = false; b.textContent = 'ลองใหม่'; return; }
    const s = load(KEY(n), null) || { answers: {}, started: Date.now() };
    save(KEY(n), s);
    run(root, go, n, r.items, s, (r.time_min || 40) * 60000);
  };
  root.appendChild(b);
}

function run(root, go, n, items, s, ms) {
  root.innerHTML = '';
  const total = items.reduce((a, it) => a + ptsOf(it), 0);
  const bar = el(`<div class="cpbar" id="cpBar"><span id="cpTime"></span><span id="cpDone"></span></div>`);
  root.appendChild(bar);
  const persist = () => save(KEY(n), s);
  const count = () => { bar.querySelector('#cpDone').textContent = `ตอบแล้ว ${Object.keys(s.answers).length}/${total}`; };
  let no = 0, last = '';
  for (const it of items) {
    const sec = { gm: 'ไวยากรณ์', vo: 'คำศัพท์', rd: 'การอ่าน', li: 'การฟัง' }[it.skill] || '';
    const head = it.kind === 'order' ? 'เรียงประโยค' : it.kind === 'cloze' ? 'เติมช่องว่าง' : sec;
    if (head !== last) { root.appendChild(el(`<h2 class="cphead">${head}</h2>`)); last = head; }
    const card = el(`<div class="card cpitem" data-id="${esc(it.id)}"></div>`);
    if (it.kind === 'read') card.appendChild(el(`<div>${it.title ? `<h3 class="en">${esc(it.title)}</h3>` : ''}<div class="en box">${String(it.passage).trim().split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join('')}</div></div>`));
    if (it.kind === 'cloze') card.appendChild(el(`<div class="en box">${esc(String(it.text).trim())}</div>`));
    if (it.kind === 'listen') {
      const text = (it.script || []).map((l) => l.en).join(' ');
      let left = 2;
      const pl = el(`<div class="row"><button class="btn quiet small-btn cpplay">▶ ฟัง (เหลือ ${left})</button><button class="link cptext">ฟังไม่ได้ อ่านข้อความแทน</button></div>`);
      pl.querySelector('.cpplay').onclick = (e) => { if (left <= 0) return; if (!say(text, 0.92)) { show(); return; } left--; e.target.textContent = `▶ ฟัง (เหลือ ${left})`; if (!left) e.target.disabled = true; };
      const show = () => { pl.replaceWith(el(`<div class="en box">${(it.script || []).map((l) => `<p><b>${esc(l.who)}:</b> ${esc(l.en)}</p>`).join('')}</div>`)); };
      pl.querySelector('.cptext').onclick = show;
      card.appendChild(pl);
    }
    if (it.kind === 'order') {
      const pick = Array.isArray(s.answers[it.id]) ? [...s.answers[it.id]] : [];
      const out = el('<div class="chunks cpout"></div>'), src = el('<div class="chunks"></div>');
      const paint = () => {
        out.innerHTML = ''; src.innerHTML = '';
        pick.forEach((c, i) => out.appendChild(Object.assign(el(`<button class="chunk on">${esc(c)}</button>`), { onclick: () => { pick.splice(i, 1); upd(); } })));
        const used = [...pick];
        it.chunks.forEach((c) => { const k = used.indexOf(c); if (k >= 0) { used.splice(k, 1); return; } src.appendChild(Object.assign(el(`<button class="chunk">${esc(c)}</button>`), { onclick: () => { pick.push(c); upd(); } })); });
      };
      const upd = () => { if (pick.length === it.chunks.length) s.answers[it.id] = [...pick]; else delete s.answers[it.id]; persist(); count(); paint(); };
      card.appendChild(el(`<p class="small">${no + 1}. แตะคำเรียงเป็นประโยค</p>`)); card.append(out, src); paint(); no++;
    } else {
      const qs = it.questions || [{ stem: it.stem, choices: it.choices }];
      qs.forEach((q, qi) => {
        const k = keyOf(it, qi), box = el(`<div class="cpq"><p class="en"><b>${++no}.</b> ${esc(q.stem || `ช่อง (${qi + 1})`)}</p></div>`);
        q.choices.forEach((c, ci) => {
          const o = el(`<button class="opt${s.answers[k] === ci ? ' sel' : ''}"><b>${ci + 1}</b><span>${esc(c.t)}</span></button>`);
          o.onclick = () => { s.answers[k] = ci; persist(); count(); box.querySelectorAll('.opt').forEach((x) => x.classList.toggle('sel', x === o)); };
          box.appendChild(o);
        });
        card.appendChild(box);
      });
    }
    root.appendChild(card);
  }
  const send = el('<button class="btn" id="cpSubmit">ส่งคำตอบและดูผล</button>');
  root.appendChild(send);
  root.appendChild(el('<p class="small">ข้อที่ไม่ได้ตอบนับเป็นผิด · คำตอบเก็บในเครื่องระหว่างทำ ปิดหน้าแล้วกลับมาทำต่อได้ภายในเวลาที่เหลือ</p>'));
  let timer = 0, sent = false;
  const submit = async (auto) => {
    if (sent) return;
    const left = total - Object.keys(s.answers).length;
    if (!auto && left > 0 && !confirm(`ยังไม่ได้ตอบ ${left} ข้อ ส่งเลยไหม`)) return;
    sent = true; clearInterval(timer); send.disabled = true; send.textContent = 'กำลังตรวจ…';
    const r = await api.checkpointSubmit(n, s.answers).catch(() => null);
    if (!r || !r.score) { sent = false; send.disabled = false; send.textContent = 'ส่งอีกครั้ง'; root.appendChild(el(`<div class="note">ส่งไม่สำเร็จ (${esc((r && r.error) || 'error')}) คำตอบยังอยู่ในเครื่อง ลองส่งอีกครั้ง</div>`)); return; }
    drop(KEY(n)); result(root, go, n, items, s.answers, r);
  };
  send.onclick = () => submit(false);
  const tick = () => {
    const rem = Math.max(0, s.started + ms - Date.now()), m = Math.floor(rem / 60000), sec = Math.floor(rem / 1000) % 60;
    const t = bar.querySelector('#cpTime'); t.textContent = `⏱ ${m}:${String(sec).padStart(2, '0')}`; t.classList.toggle('warn', rem < 5 * 60000);
    if (!rem) submit(true);
  };
  count(); tick(); timer = setInterval(tick, 1000);
}

function result(root, go, n, items, answers, r) {
  const sc = r.score, full = r.items || {};
  root.innerHTML = '';
  window.scrollTo(0, 0);
  const pct = sc.pct, msg = pct >= 80 ? '🌟 เยี่ยมมาก' : pct >= 60 ? '👍 ดีเลย' : n === 1 ? '🌱 จุดเริ่มต้นที่ดี' : '💪 สู้ต่อ';
  root.appendChild(el(`<div><h1>ผลชุดวัดผลครั้งที่ ${n}</h1>
    <div class="card"><p class="price" id="cpTotal">${sc.total}/${sc.max} <small>คะแนน (${pct}%)</small></p><p>${msg}${n === 1 ? ' · ครั้งแรกมีเรื่องที่ยังไม่ได้เรียน ครั้งต่อไปจะเห็นคะแนนเพิ่มขึ้น' : ''}</p>
    ${Object.entries(sc.by_skill || {}).map(([k, v]) => `<div class="skill"><span>${SKILL_TH[k] || k}</span><div class="bar"><span style="width:${Math.round(100 * v.correct / v.n)}%"></span></div><small>${v.correct}/${v.n}</small></div>`).join('')}
    ${r.extended ? '<p class="note">คุณเรียนครบตามแผนแล้ว ระบบต่อเวลาเรียนให้ฟรี 3 เดือนตามข้อรับรองความคุ้มค่า</p>' : ''}</div>
    <h2>เฉลยทีละข้อ</h2></div>`));
  let no = 0;
  for (const it0 of items) {
    const it = full[it0.id]; if (!it) continue;
    if (it.kind === 'order') {
      const mine = answers[it.id], ok = Array.isArray(mine) && mine.join('|') === it.chunks.join('|');
      root.appendChild(el(`<div class="card cpans ${ok ? 'ok' : 'no'}"><p><b>${++no}.</b> ${ok ? '✓' : '✕'} <span class="en">${esc(it.sentence)}</span></p><p class="small">${rich(it.why || '')}</p></div>`));
      continue;
    }
    const qs = it.questions || [{ stem: it.stem, choices: it.choices, answer: it.answer }];
    const ctx = it.kind === 'read' ? esc(it.title || 'บทอ่าน') : it.kind === 'listen' ? esc((it.script || []).map((l) => `${l.who}: ${l.en}`).join(' ')) : it.kind === 'cloze' ? esc(String(it.text).trim()) : '';
    const c = el(`<div class="card cpans">${ctx ? `<p class="small en">${ctx}</p>` : ''}</div>`);
    qs.forEach((q, qi) => {
      const mine = answers[keyOf(it, qi)], ok = mine === q.answer, right = q.choices[q.answer];
      c.appendChild(el(`<div class="cpa ${ok ? 'ok' : 'no'}"><p><b>${++no}.</b> ${ok ? '✓' : '✕'} <span class="en">${esc(q.stem || `ช่อง (${qi + 1})`)}</span></p>
        ${ok ? '' : `<p class="small">คุณตอบ: ${mine === undefined ? 'ไม่ได้ตอบ' : esc(q.choices[mine] ? q.choices[mine].t : '')}</p>`}
        <p class="small">ข้อถูก: <b class="en right">${esc(right.t)}</b> · ${rich(right.why || '')}</p></div>`));
    });
    if (it.explain) c.appendChild(el(keepBox(it.explain)));
    root.appendChild(c);
  }
  root.appendChild(Object.assign(el('<button class="btn" id="cpBack">กลับหน้าผล</button>'), { onclick: () => go('results') }));
}
