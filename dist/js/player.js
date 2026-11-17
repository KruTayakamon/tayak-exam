// ตัวเล่นเซสชัน: เดินทีละการ์ดตามแผนจากเซิร์ฟเวอร์ · เก็บตำแหน่งทุกการ์ดเพื่อทำต่อจากที่ค้าง · เก็บคำตอบเข้าคิวในเครื่องแล้วส่งเป็นระยะ
// สเปก: docs/cefr/01_course_design.md ข้อ 3.1 และ docs/cefr/07_web_app.md
import { api } from './api.js';
import { getSession, putSession, clearSession, getQueue, pushEvent, dropEvents, newId } from './store.js';
import { renderItem, el, esc, mark, rich, notesHtml, say, canSay, spk, spkThai } from './items.js';

const STEP_NO = { review: 0, learn: 1, check: 1, lab_prepare: 1, practice: 2, mock: 2, use: 3, lab_do: 3, close: 4 };
const STEP_TH = { review: 'ทบทวน', learn: 'เรียน', check: 'เรียน', lab_prepare: 'เตรียม', practice: 'ฝึก', mock: 'ชุดย่อย', use: 'ใช้', lab_do: 'ลงมือ', close: 'สรุป' };
const COST = { item: 0.75, learn: 3, use: 2, close: 1, lab_prepare: 6, lab_do: 10, mock: 15 };

/** แผนจากเซิร์ฟเวอร์ → รายการการ์ดเรียงตามลำดับที่ผู้เรียนเห็น */
export function flatten(plan) {
  const cards = [];
  for (const s of plan.steps) {
    if (s.step === 'review' || s.step === 'practice') for (const id of s.ids || []) cards.push({ type: 'item', step: s.step, mode: s.step, id });
    else if (s.step === 'learn') { cards.push({ type: 'learn', step: 'learn', lesson: s.lesson }); for (const id of s.check || []) cards.push({ type: 'item', step: 'check', mode: 'check', id }); }
    else if (s.step === 'use') cards.push({ type: 'use', step: 'use', use: s.use });
    else if (s.step === 'close') cards.push({ type: 'close', step: 'close', classroom: s.classroom });
    else if (s.step === 'lab_prepare' || s.step === 'lab_do') cards.push({ type: s.step, step: s.step, lab: s.lab });
    else if (s.step === 'mock') cards.push({ type: 'mock', step: 'mock', mock: s.mock });
  }
  if (!cards.length || cards[cards.length - 1].type !== 'close') cards.push({ type: 'close', step: 'close' });
  return cards;
}
const minutesLeft = (cards, idx) => Math.max(1, Math.round(cards.slice(idx).reduce((a, c) => a + (COST[c.type] ?? 1), 0)));

/** ส่งคำตอบที่ค้างในคิว (ไม่รอผล ไม่รบกวนผู้เรียน) · คำตอบที่เซิร์ฟเวอร์รับแล้วจึงลบออกจากคิว */
export async function flush(completed) {
  const events = getQueue();
  if (!events.length && !completed) return null;
  try {
    const r = await api.sync({ events, completed });
    if (r && !r.error) dropEvents(events.map((e) => e.eid));
    return r;
  } catch { return null; }                                  // เน็ตหลุด: เก็บไว้ในคิว ส่งรอบหน้า
}

export async function openSession(root, kind, onExit) {
  let s = getSession();
  if (!s || s.kind !== kind) {
    const r = await api.session({ kind });
    if (!r || r.error) { onExit('error', r ? r.error : 'network'); return; }
    s = { kind, plan: r.plan, items: r.items, day: r.day, idx: 0, right: 0, total: 0, wrong: [], startedAt: Date.now(), answered: {} };
    putSession(s);
  }
  const cards = flatten(s.plan);
  const go = (n) => { s.idx = n; putSession(s); draw(); };

  function frame(card) {
    root.innerHTML = '';
    const top = el(`<div class="topbar"><button class="x" id="exitBtn">✕ ออก</button><span class="small" id="stepLabel">ขั้น ${STEP_NO[card.step] + 1} จาก 5 · ${STEP_TH[card.step]}</span><span class="small">เหลือ ~${minutesLeft(cards, s.idx)} นาที</span></div>`);
    top.querySelector('#exitBtn').addEventListener('click', () => { flush(); onExit('paused'); });
    const bar = el('<div class="steps" aria-hidden="true">' + [0, 1, 2, 3, 4].map((i) => `<i class="${i <= STEP_NO[card.step] ? 'on' : ''}"></i>`).join('') + '</div>');
    const body = el('<div class="screen" id="card"></div>');
    root.append(top, bar, body);
    return body;
  }
  const nextBtn = (label = 'ข้อต่อไป') => { const b = el(`<button class="btn" id="nextBtn">${label}</button>`); b.addEventListener('click', () => go(s.idx + 1)); return b; };

  function draw() {
    const card = cards[s.idx], body = frame(card);
    if (card.type === 'item') {
      const it = s.items[card.id];
      const n = cards.filter((c, i) => c.type === 'item' && c.step === card.step && i <= s.idx).length, of = cards.filter((c) => c.type === 'item' && c.step === card.step).length;
      body.appendChild(el(`<p class="small">${card.step === 'review' ? 'ข้อที่เคยเจอ กลับมาทบทวน' : card.step === 'check' ? 'เช็กความเข้าใจ' : 'ฝึก'} · ข้อ ${n}/${of}</p>`));
      const host = el('<div class="screen"></div>'); body.appendChild(host);
      renderItem(host, it, (res) => {
        if (!s.answered[card.id + ':' + s.idx]) {                           // กันนับซ้ำเมื่อโหลดหน้าใหม่กลางข้อ
          s.answered[card.id + ':' + s.idx] = 1;
          for (const a of res.answers) { pushEvent({ eid: newId(), item: it.id, q: a.q, answer: a.answer, mode: card.mode, ts: Date.now() }); s.total++; if (a.correct) s.right++; }
          if (res.answers.some((a) => !a.correct)) s.wrong.push(it.id);
          putSession(s); flush();
        }
        if (res.answers.some((a) => !a.correct) && !it.questions) body.appendChild(el('<p class="small" id="comeBack">ข้อนี้จะกลับมาให้ทบทวนพรุ่งนี้</p>'));
        body.appendChild(nextBtn(s.idx + 1 < cards.length && cards[s.idx + 1].type === 'item' ? 'ข้อต่อไป' : 'ไปต่อ'));
      }, { onReport: (id) => api.report({ item_id: id, why: 'other' }) });
    } else if (card.type === 'learn') {
      const L = card.lesson;
      body.appendChild(el(`<h2 class="rule">${rich(L.rule_th)}</h2>`));
      const th = spkThai([L.rule_th, L.thai_trap ? L.thai_trap.intro_th : '', ...(L.notes || []).map((n) => n.th)].join(' . '));
      if (th) body.appendChild(th);
      const exs = el('<div class="card"></div>');
      for (const x of L.examples) {
        const row = el(`<div class="ex"><div class="row"><span class="en grow">${mark(x.en)}</span></div><span class="small">${rich(x.th)}</span></div>`);
        const sp = spk(x.en.replace(/<\/?k>/g, '')); if (sp) row.querySelector('.row').appendChild(sp);
        exs.appendChild(row);
      }
      body.appendChild(exs);
      if (L.notes) body.appendChild(el('<div class="stickies">' + notesHtml(L.notes) + '</div>'));
      if (L.words) {
        const wl = el('<div class="card"><h2>คำศัพท์วันนี้</h2><ul class="words"></ul></div>');
        for (const w of L.words) {
          const li = el(`<li><div class="row"><span class="grow"><span class="en"><b>${esc(w.w)}</b></span> <span class="small">${esc(w.pos)}</span> ${esc(w.th)}</span></div><div class="en small">${esc(w.ex)}</div></li>`);
          const sp = spk(`${w.w}. ${w.ex}`, `ฟังคำว่า ${w.w}`); if (sp) li.querySelector('.row').appendChild(sp);
          wl.querySelector('ul').appendChild(li);
        }
        body.appendChild(wl);
      }
      for (const g of L.signals || []) body.appendChild(el(`<p class="small"><b>${esc(g.label_th)}:</b> <span class="en">${esc(g.words.join(', '))}</span></p>`));
      const t = L.thai_trap;
      body.appendChild(el(`<div class="card"><h2>จุดที่คนไทยพลาดบ่อย</h2><p>${rich(t.intro_th)}</p>` + t.wrong.map((w, i) => `<p><s class="en">${esc(w)}</s><br><span class="en"><b>${esc(t.right[i] ?? '')}</b></span></p>`).join('') + '</div>'));
      body.appendChild(nextBtn('เข้าใจแล้ว ไปต่อ'));
    } else if (card.type === 'use') {
      const u = card.use;
      body.appendChild(el(`<h2>ลองใช้เอง</h2>`)); body.appendChild(el(`<p>${esc(u.prompt_th)}</p>`));
      body.appendChild(el(`<label class="field">โครง: <span class="en">${esc(u.frame)}</span><textarea id="useIn" spellcheck="false"></textarea></label>`));
      const show = el('<button class="btn quiet" id="showModel">ดูตัวอย่างคำตอบ</button>');
      show.addEventListener('click', () => { show.replaceWith(el(`<div class="card"><p class="small">ตัวอย่าง (เทียบกับของคุณเอง ไม่มีการให้คะแนน)</p><p class="en">${esc(u.model)}</p></div>`)); });
      body.append(show, nextBtn('ไปต่อ'));
    } else if (card.type === 'lab_prepare' || card.type === 'lab_do') {
      const lab = card.lab, speak = lab.mode === 'speak';
      body.appendChild(el(`<h2>ห้องฝึก${speak ? 'พูด' : 'เขียน'}</h2>`)); body.appendChild(el(`<p>${esc(lab.prompt_th)}</p>`));
      if (card.type === 'lab_prepare') {
        body.appendChild(el('<div class="card"><p class="small">โครงที่ใช้</p>' + lab.frame.map((f) => `<p class="en">${esc(f)}</p>`).join('') + '</div>'));
        const m = el(`<div class="card"><p class="small">ตัวอย่างระดับผ่านเกณฑ์</p><p class="en">${esc(lab.model_pass)}</p>${canSay() ? '<button class="btn quiet" id="sayModel">ฟังตัวอย่าง</button>' : ''}</div>`);
        if (canSay()) m.querySelector('#sayModel').addEventListener('click', () => say(lab.model_pass, 0.9));
        body.append(m, nextBtn('พร้อมแล้ว ไปลงมือ'));
      } else {
        body.appendChild(el('<div class="card"><p class="small">ขั้นตอน</p><ol>' + lab.steps_th.map((x) => `<li>${esc(x)}</li>`).join('') + '</ol></div>'));
        if (!speak) body.appendChild(el('<label class="field">งานเขียนของคุณ (เก็บในเครื่องนี้เท่านั้น)<textarea id="labIn" spellcheck="false"></textarea></label>'));
        body.appendChild(el(`<div class="card"><p class="small">ตัวอย่างระดับดี</p><p class="en">${esc(lab.model_good)}</p></div>`));
        body.appendChild(el('<div class="card"><p class="small">ตรวจตนเอง</p>' + lab.checklist_th.map((x, i) => `<label class="check"><input type="checkbox" id="chk${i}"><span>${esc(x)}</span></label>`).join('') + '</div>'));
        body.appendChild(nextBtn('ไปต่อ'));
      }
    } else if (card.type === 'mock') {
      body.appendChild(el(`<h2>ชุดย่อยจับเวลา ${card.mock.items} ข้อ ${card.mock.time_min} นาที</h2>`));
      body.appendChild(el(`<div class="note">${esc(card.mock.note_th || 'ชุดย่อยของสัปดาห์นี้ยังไม่มีข้อในคลัง')}</div>`));
      body.appendChild(nextBtn('ข้ามไปสรุป'));
    } else {                                                                  // close
      const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
      const hasMock = cards.some((c) => c.type === 'mock'), kindDone = s.kind === 'short' ? 'short' : hasMock ? 'mock' : 'full';
      body.appendChild(el(`<span class="tag">จบเซสชัน · ${mins} นาที</span>`));
      body.appendChild(el(`<h1 id="sumScore">${s.total ? `ถูก ${s.right} จาก ${s.total} ข้อ` : 'ทำครบแล้ว'}</h1>`));
      const wrongN = new Set(s.wrong).size;
      body.appendChild(el('<div class="card"><h2>วันนี้ได้อะไร</h2><ul class="list">' + [s.total ? `ตอบ ${s.total} ข้อ ถูกตั้งแต่ครั้งแรก ${s.right} ข้อ` : null, wrongN ? `${wrongN} ข้อจะกลับมาให้ทบทวน` : s.total ? 'ไม่มีข้อที่ต้องกลับมาทบทวนจากวันนี้' : null].filter(Boolean).map((t) => `<li><span class="tick" aria-hidden="true">✓</span><span>${t}</span></li>`).join('') + '</ul></div>'));
      if (card.classroom) {
        const c = el(`<div class="card"><h2>ประโยคใช้ในห้องเรียน</h2><p class="en">${esc(card.classroom.en)}</p><p class="small">${esc(card.classroom.th)}</p>${canSay() ? '<button class="btn quiet" id="sayClass">ฟังเสียงอ่าน</button>' : ''}</div>`);
        if (canSay()) c.querySelector('#sayClass').addEventListener('click', () => say(card.classroom.en, 0.9));
        body.appendChild(c);
      }
      const fin = el('<button class="btn" id="finishBtn">จบเซสชัน</button>');
      fin.addEventListener('click', async () => {
        fin.disabled = true; fin.textContent = 'กำลังบันทึก';
        const r = await flush({ kind: kindDone, minutes: mins });
        if (!r || r.error) { fin.disabled = false; fin.textContent = 'บันทึกไม่สำเร็จ แตะเพื่อลองใหม่'; return; }   // ไม่ล้างเซสชันจนกว่าเซิร์ฟเวอร์รับ
        clearSession(); onExit('done', { right: s.right, total: s.total, minutes: mins, kind: kindDone });
      });
      body.appendChild(fin);
    }
    window.scrollTo(0, 0);
  }
  draw();
}
