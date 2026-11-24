// ตัวเล่นเซสชัน: เดินทีละการ์ดตามแผนจากเซิร์ฟเวอร์ · เก็บตำแหน่งทุกการ์ดเพื่อทำต่อจากที่ค้าง · เก็บคำตอบเข้าคิวในเครื่องแล้วส่งเป็นระยะ
// สเปก: docs/cefr/01_course_design.md ข้อ 3.1 และ docs/cefr/07_web_app.md
import { api } from './api.js';
import { getSession, putSession, clearSession, getQueue, pushEvent, dropEvents, newId, getStars, putStars } from './store.js';
import { renderItem, el, esc, mark, rich, notesHtml, say, canSay, spk, spkThai, keepBox } from './items.js';
import { lookupTip } from './lookup.js';
import { timedSet } from './checkpoint.js';
import { grade } from './engine/grade.mjs';

// ---------- คำชม ดาว และตราพิเศษ (มติบอส 17 พ.ย. รอบ 17) ----------
const PRAISE = ['เก่งมาก!', 'ถูกเป๊ะ!', 'เยี่ยมเลย!', 'แม่นมาก!', 'สุดยอด!', 'ใช่เลย!', 'ปังมาก!', 'คล่องขึ้นเรื่อย ๆ!'];
const CHEER_TRY = ['ไม่เป็นไรนะ ข้อนี้จะกลับมาให้ลองใหม่พรุ่งนี้', 'เกือบแล้ว! อ่านหลักที่ควรจำอีกนิด พรุ่งนี้เจอกันใหม่', 'พลาดได้ เดี๋ยวข้อนี้วนกลับมาให้แก้มือ'];
const COMBO = { 3: ['🔥', 'ถูก 3 ข้อติด!'], 5: ['⚡', '5 ข้อติด ไฟลุกแล้ว!'], 8: ['🚀', '8 ข้อติด หยุดไม่อยู่!'], 10: ['🏆', '10 ข้อติด ระดับตำนาน!'] };
/** ตราของเซสชันจากสถิติที่ทำได้ · คืน [{k, icon, th}] */
export function badgesOf(s) {
  const b = [{ k: 'done', icon: '✅', th: 'เรียนครบวันนี้' }];
  if (s.total && s.right === s.total) b.unshift({ k: 'perfect', icon: '👑', th: 'ถูกหมดทุกข้อ!' });
  else if (s.total && s.right / s.total >= 0.8) b.unshift({ k: 'great', icon: '🌟', th: 'ถูกเกิน 80%' });
  if ((s.best || 0) >= 5) b.push({ k: 'streak', icon: '🔥', th: `ถูกติดกัน ${s.best} ข้อ` });
  if (s.wrote) b.push({ k: 'wrote', icon: '✍️', th: 'ลงมือเขียนเอง' });
  return b;
}
const starRow = (n) => `<span class="stars" aria-label="${n} ดาว">${'★'.repeat(Math.min(n, 12))}${n > 12 ? ` <small>×${n}</small>` : ''}</span>`;

/** ตรวจงานเขียนสั้นแบบไม่ใช้ AI: เทียบกับโครงและตัวอย่าง · คืนรายการจุดตรวจ [{ok, th}] */
export function checkUse(text, frame, model) {
  const t = String(text).trim(), out = [];
  const words = (x) => x.toLowerCase().replace(/[^a-z'/\s-]/g, ' ').split(/\s+/).filter(Boolean);
  out.push(/[\u0E00-\u0E7F]/.test(t) ? { ok: false, th: 'มีภาษาไทยปนอยู่ ลองเขียนเป็นภาษาอังกฤษทั้งหมดนะ' } : { ok: true, th: 'เขียนเป็นภาษาอังกฤษล้วน' });
  const fixed = String(frame).split(/_{3,}/).flatMap(words);
  const have = new Set(words(t)), missing = fixed.filter((w) => !w.split('/').some((x) => have.has(x)));
  out.push(missing.length ? { ok: false, th: `ยังขาดคำจากโครง: ${missing.join(', ')}` } : { ok: true, th: 'ใช้โครงประโยคครบ' });
  const blanks = (String(frame).match(/_{3,}/g) || []).length;
  out.push(words(t).length >= fixed.length + blanks ? { ok: true, th: 'เติมช่องว่างครบทุกช่อง' } : { ok: false, th: 'ยังเติมช่องว่างไม่ครบ ลองเพิ่มรายละเอียดอีกนิด' });
  const sents = t.split(/(?<=[.?!])\s+/).filter(Boolean);
  const capOk = sents.every((x) => /^[A-Z"]/.test(x)) && /[.?!]$/.test(t) && !/(^|\s)i(\s|')/.test(t);
  out.push(capOk ? { ok: true, th: 'ขึ้นต้นตัวใหญ่ ลงท้ายด้วยจุดหรือเครื่องหมายคำถาม' } : { ok: false, th: 'เช็กตัวพิมพ์ใหญ่ต้นประโยค (และคำว่า I) กับจุดท้ายประโยค' });
  // โครงที่มี am/is/are ตามด้วยช่องว่าง และตัวอย่างใช้ -ing → คำตอบต้องมี -ing หลัง am/is/are
  if (/\b(am|is|are)\s+_{3,}/i.test(frame) && /\b(am|is|are)\s+\w+ing\b/i.test(model)) {
    const m = t.match(/\b(am|is|are)\s+(\w+)/gi) || [];
    out.push(m.some((x) => /ing$/i.test(x)) ? { ok: true, th: 'am/is/are ตามด้วยกริยา -ing ถูกต้อง' } : { ok: false, th: 'หลัง am/is/are อย่าลืมกริยาเติม -ing' });
  }
  return out;
}

const STEP_NO = { review: 0, learn: 1, check: 1, lab_prepare: 1, practice: 2, mock: 2, use: 3, lab_do: 3, close: 4 };
const STEP_TH = { review: 'ทบทวน', learn: 'เรียน', check: 'เรียน', lab_prepare: 'เตรียม', practice: 'ฝึก', mock: 'ชุดย่อย', use: 'ใช้', lab_do: 'ลงมือ', close: 'สรุป' };
const COST = { item: 0.75, learn: 3, use: 2, close: 1, lab_prepare: 6, lab_do: 10, mock: 15 };

/** แผนจากเซิร์ฟเวอร์ → รายการการ์ดเรียงตามลำดับที่ผู้เรียนเห็น */
export function flatten(plan) {
  const cards = [];
  for (const s of plan.steps) {
    if (s.step === 'review' || s.step === 'practice') for (const id of s.ids || []) cards.push({ type: 'item', step: s.step, mode: s.step, id });
    else if (s.step === 'learn') { cards.push({ type: 'learn', step: 'learn', lesson: s.lesson, day: s.day || 1, title: s.title || '' }); for (const id of s.check || []) cards.push({ type: 'item', step: 'check', mode: 'check', id }); }
    else if (s.step === 'use') cards.push({ type: 'use', step: 'use', use: s.use });
    else if (s.step === 'close') cards.push({ type: 'close', step: 'close', classroom: s.classroom });
    else if (s.step === 'lab_prepare' || s.step === 'lab_do') cards.push({ type: s.step, step: s.step, lab: s.lab });
    else if (s.step === 'mock') cards.push({ type: 'mock', step: 'mock', mock: s.mock, ids: s.ids || [] });
  }
  if (!cards.length || cards[cards.length - 1].type !== 'close') cards.push({ type: 'close', step: 'close' });
  return cards;
}
const minutesLeft = (cards, idx) => Math.max(1, Math.round(cards.slice(idx).reduce((a, c) => a + (COST[c.type] ?? 1), 0)));

/** ส่งคำตอบที่ค้างในคิว (ไม่รอผล ไม่รบกวนผู้เรียน) · คำตอบที่เซิร์ฟเวอร์รับแล้วจึงลบออกจากคิว */
export async function flush(completed, stars) {
  const events = getQueue();
  if (!events.length && !completed) return null;
  try {
    const r = await api.sync({ events, completed, ...(stars ? { stars } : {}) });
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
          for (const a of res.answers) {
            pushEvent({ eid: newId(), item: it.id, q: a.q, answer: a.answer, mode: card.mode, ts: Date.now() }); s.total++;
            if (a.correct) { s.right++; s.streak = (s.streak || 0) + 1; s.best = Math.max(s.best || 0, s.streak); } else s.streak = 0;
          }
          s.cheer = s.cheer || {}; s.cheer[s.idx] = { ok: res.answers.filter((a) => a.correct).length, n: res.answers.length, streak: s.streak };
          if (res.answers.some((a) => !a.correct)) s.wrong.push(it.id);
          putSession(s); flush();
        }
        const c = (s.cheer || {})[s.idx] || { ok: 0, n: 1, streak: 0 };
        // คำชมขึ้นทันทีใต้ตัวเลือก (ก่อนกล่องหลักที่ควรจำ) ให้เห็นโดยไม่ต้องเลื่อน
        const put = (node) => { const k = host.querySelector('#reportBtn') || host.querySelector('.keep') || host.querySelector('#sayRight'); if (k) k.before(node); else body.appendChild(node); };
        if (c.ok === c.n) {
          const combo = COMBO[c.streak];
          put(el(`<div class="cheer ok" id="cheer"><span class="pop">⭐</span><div><b>${PRAISE[(s.right + s.idx) % PRAISE.length]}</b><small>+${c.ok} ดาว · วันนี้ได้ ${s.right} ดาวแล้ว</small></div></div>`));
          if (combo) put(el(`<div class="combo" id="combo"><span>${combo[0]}</span> ${combo[1]}</div>`));
        } else if (c.ok) put(el(`<div class="cheer mid" id="cheer"><span class="pop">✨</span><div><b>ได้ ${c.ok} จาก ${c.n} ข้อ ดีเลย!</b><small>+${c.ok} ดาว · ข้อที่พลาดจะกลับมาให้ทบทวน</small></div></div>`));
        else put(el(`<div class="cheer try" id="comeBack"><span class="pop">💪</span><div><b>${CHEER_TRY[s.idx % CHEER_TRY.length]}</b></div></div>`));
        body.appendChild(nextBtn(s.idx + 1 < cards.length && cards[s.idx + 1].type === 'item' ? 'ข้อต่อไป' : 'ไปต่อ'));
      }, { onReport: (id) => api.report({ item_id: id, why: 'other' }) });
    } else if (card.type === 'learn') {
      const L = card.lesson;
      // หน้าสมุดโน้ต: โทนสีเปลี่ยนตามวัน (d1–d6) · แถบเทปบอกวันและหัวข้อ · กติกาเขียนบนกระดาษเส้น
      const page = el(`<div class="nb d${Math.min(6, Math.max(1, card.day || 1))}" id="nbPage"><div class="nb-tape">วันที่ ${card.day || 1}${card.title ? ' · ' + esc(card.title) : ''}</div></div>`);
      body.appendChild(page);
      const tip = lookupTip(); if (tip) body.insertBefore(el(tip), page);
      const outer = body; { const body = page;
      body.appendChild(el(`<h2 class="rule">${rich(L.rule_th)}</h2>`));
      const th = spkThai([L.rule_th, L.thai_trap ? L.thai_trap.intro_th : '', ...(L.notes || []).map((n) => n.th)].join(' . '));
      if (th) body.appendChild(th);
      const exs = el('<div class="card lined"></div>');
      for (const x of L.examples) {
        const row = el(`<div class="ex"><div class="row"><span class="en grow">${mark(x.en)}</span></div><span class="small">${rich(x.th)}</span></div>`);
        const sp = spk(x.en.replace(/<\/?k>/g, '')); if (sp) row.querySelector('.row').appendChild(sp);
        exs.appendChild(row);
      }
      body.appendChild(exs);
      if (L.notes) body.appendChild(el('<div class="stickies">' + notesHtml(L.notes) + '</div>'));
      if (L.words) {
        const wl = el('<div class="card lined"><h2>คำศัพท์วันนี้</h2><ul class="words"></ul></div>');
        for (const w of L.words) {
          const li = el(`<li><div class="row"><span class="grow"><span class="en"><b>${esc(w.w)}</b></span> <span class="small">${esc(w.pos)}</span> ${esc(w.th)}</span></div><div class="en small">${esc(w.ex)}</div></li>`);
          const sp = spk(`${w.w}. ${w.ex}`, `ฟังคำว่า ${w.w}`); if (sp) li.querySelector('.row').appendChild(sp);
          wl.querySelector('ul').appendChild(li);
        }
        body.appendChild(wl);
      }
      for (const g of L.signals || []) body.appendChild(el(`<div class="signals"><span class="small"><b>${esc(g.label_th)}</b></span><div class="chips">${g.words.map((w) => `<span class="sig en">${esc(w)}</span>`).join('')}</div></div>`));
      const t = L.thai_trap;
      body.appendChild(el(`<div class="card trap"><h2><span class="stamp">ระวัง!</span> จุดที่คนไทยพลาดบ่อย</h2><p>${rich(t.intro_th)}</p>` + t.wrong.map((w, i) => `<p><s class="en">${esc(w)}</s><br><span class="en"><b>${esc(t.right[i] ?? '')}</b></span></p>`).join('') + '</div>'));
      }
      outer.appendChild(nextBtn('เข้าใจแล้ว ไปต่อ'));
    } else if (card.type === 'use') {
      const u = card.use;
      body.appendChild(el(`<h2>ลองใช้เอง</h2>`)); body.appendChild(el(`<p>${esc(u.prompt_th)}</p>`));
      body.appendChild(el(`<label class="field">โครง: <span class="en">${esc(u.frame)}</span><textarea id="useIn" spellcheck="false" placeholder="พิมพ์ประโยคของคุณที่นี่"></textarea></label>`));
      const fbHost = el('<div class="screen" id="useFb"></div>');
      const chk = el('<button class="btn" id="checkUse">ตรวจงานเขียน</button>');
      chk.addEventListener('click', () => {
        const txt = body.querySelector('#useIn').value;
        if (!txt.trim()) { fbHost.innerHTML = '<div class="cheer try"><span class="pop">✏️</span><div><b>ลองเขียนสักประโยคก่อนนะ</b><small>ใช้โครงด้านบนช่วยได้</small></div></div>'; return; }
        const pts = checkUse(txt, u.frame, u.model), good = pts.filter((x) => x.ok).length;
        s.wrote = 1; putSession(s);
        const shared = new Set(txt.toLowerCase().match(/[a-z']+/g) || []);
        const modelHtml = esc(u.model).replace(/[A-Za-z']+/g, (w) => (shared.has(w.toLowerCase()) ? `<mark class="hl g">${w}</mark>` : w));
        fbHost.innerHTML = (good === pts.length
          ? `<div class="cheer ok"><span class="pop">🌟</span><div><b>ครบทุกจุด เขียนได้ดีมาก!</b><small>${starRow(good)} ได้ตรา ✍️ ลงมือเขียนเอง</small></div></div>`
          : `<div class="cheer mid"><span class="pop">✨</span><div><b>ผ่าน ${good} จาก ${pts.length} จุด ใกล้แล้ว!</b><small>${starRow(good)} แก้ตรงที่มี ✕ แล้วกดตรวจอีกครั้งได้</small></div></div>`)
          + `<div class="card checks"><h2>จุดตรวจ</h2>${pts.map((x) => `<p class="${x.ok ? 'ck-ok' : 'ck-bad'}"><b>${x.ok ? '✓' : '✕'}</b> ${esc(x.th)}</p>`).join('')}</div>`
          + `<div class="card" id="useModel"><p class="small">ตัวอย่างคำตอบ · <mark class="hl g">สีเขียว</mark> = คำที่คุณใช้ตรงกับตัวอย่าง</p><p class="en">${modelHtml}</p></div>`
          + keepBox('เครื่องตรวจแค่รูปแบบเบื้องต้น ++ประโยคของคุณไม่ต้องเหมือนตัวอย่าง++ ขอแค่ใช้โครงถูกและสื่อความได้ ลองอ่านออกเสียงดูด้วยนะ', 'อ่านก่อนไปต่อ');
        chk.textContent = 'แก้แล้ว ตรวจอีกครั้ง';
        const sp = spk(u.model); if (sp) fbHost.querySelector('#useModel .small').after(sp);
      });
      body.append(chk, fbHost, nextBtn('ไปต่อ'));
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
        const cl = el('<div class="card"><p class="small">ตรวจตนเอง ติ๊กข้อที่ทำได้แล้ว</p>' + lab.checklist_th.map((x, i) => `<label class="check"><input type="checkbox" id="chk${i}"><span>${esc(x)}</span></label>`).join('') + '<div id="labCheer"></div></div>');
        cl.addEventListener('change', () => {
          const n = cl.querySelectorAll('input:checked').length, all = lab.checklist_th.length;
          cl.querySelector('#labCheer').innerHTML = n === all ? `<div class="cheer ok"><span class="pop">🏅</span><div><b>ครบทุกข้อ ยอดเยี่ยม!</b><small>${starRow(all)} ได้ตรา ✍️ ลงมือ${speak ? 'พูด' : 'เขียน'}เอง</small></div></div>` : n ? `<p class="small">${starRow(n)} อีก ${all - n} ข้อจะครบ</p>` : '';
          if (n === all) { s.wrote = 1; putSession(s); }
        });
        body.append(cl, nextBtn('ไปต่อ'));
      }
    } else if (card.type === 'mock') {
      const its = (card.ids || []).map((id) => s.items[id]).filter(Boolean);
      const mins = card.mock.time_min || 15, pts = its.reduce((a, it) => a + (it.questions ? it.questions.length : 1), 0);
      if (!its.length) {                                                  // ยังไม่มีข้อสำรองในคลัง
        body.appendChild(el(`<h2>ชุดย่อยจับเวลา ${card.mock.items} ข้อ ${mins} นาที</h2>`));
        body.appendChild(el('<div class="note">ชุดย่อยของสัปดาห์นี้ยังไม่พร้อม ข้ามไปสรุปได้เลย</div>'));
        body.appendChild(nextBtn('ข้ามไปสรุป'));
      } else if (s.mockScore) {                                           // ทำแล้ว (โหลดหน้าใหม่หลังส่ง)
        body.appendChild(el(`<div class="card" id="mockDone"><h2>ชุดย่อยจับเวลา</h2><p class="price">${s.mockScore.total}/${s.mockScore.max} <small>คะแนน</small></p></div>`));
        body.appendChild(nextBtn('ไปต่อ'));
      } else {
        body.appendChild(el(`<div id="mockIntro"><h2>ชุดย่อยจับเวลา ${pts} ข้อ ${mins} นาที</h2><div class="card"><ul class="list">
          <li><span class="tick">✓</span><span>ทบทวนเรื่องของสัปดาห์นี้ และบางข้อจากสัปดาห์ก่อน</span></li>
          <li><span class="tick">✓</span><span>ระหว่างทำยังไม่เห็นเฉลย ส่งแล้วเห็นคะแนน เฉลย และเหตุผลทุกข้อ</span></li>
          <li><span class="tick">✓</span><span>หัวข้อที่ได้ต่ำ ระบบจะพาทบทวนให้ในวันต่อ ๆ ไป</span></li></ul></div></div>`));
        const go2 = el('<button class="btn" id="mockStart">เริ่มทำ</button>');
        go2.onclick = () => {
          body.innerHTML = '';
          timedSet(body, its, mins * 60000, {
            key: 'cfk-mock-' + card.ids.join('').length + card.ids[0], title: 'ผลชุดย่อยจับเวลา', backLabel: 'ไปต่อ',
            grade: (answers) => {                                         // ตรวจในเครื่อง (ข้อในเซสชันมีเฉลยอยู่แล้ว) แล้วส่งคำตอบเข้าคิวเหมือนข้ออื่น
              const by = {}; let total = 0, max = 0;
              for (const it of its) {
                const qs = it.questions || [it];
                qs.forEach((q, qi) => {
                  const k = it.questions && it.questions.length > 1 ? `${it.id}:${qi}` : it.id, a = answers[k];
                  const ok = a !== undefined && grade(it, qi, a);
                  max++; if (ok) total++;
                  by[it.skill] = by[it.skill] || { correct: 0, n: 0 }; by[it.skill].n++; if (ok) by[it.skill].correct++;
                  if (a !== undefined) pushEvent({ eid: newId(), item: it.id, q: qi, answer: a, mode: 'mock', ts: Date.now() });
                  s.total++; if (ok) s.right++; else if (!s.wrong.includes(it.id)) s.wrong.push(it.id);
                });
              }
              s.mockScore = { total, max }; putSession(s); flush();
              return { score: { total, max, pct: Math.round(100 * total / max), by_skill: by }, items: Object.fromEntries(its.map((it) => [it.id, it])) };
            },
            onBack: () => go(s.idx + 1),
          });
        };
        body.appendChild(go2);
      }
    } else {                                                                  // close
      const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
      const hasMock = cards.some((c) => c.type === 'mock'), kindDone = s.kind === 'short' ? 'short' : hasMock ? 'mock' : 'full';
      body.appendChild(el(`<span class="tag">จบเซสชัน · ${mins} นาที</span>`));
      body.appendChild(el(`<h1 id="sumScore">${s.total ? `ถูก ${s.right} จาก ${s.total} ข้อ` : 'ทำครบแล้ว'}</h1>`));
      const bs = badgesOf(s);
      body.appendChild(el(`<div class="card trophy" id="trophy">${s.right ? `<p class="bigstars">${starRow(s.right)}</p><p><b>วันนี้ได้ ${s.right} ดาว</b>${s.best >= 3 ? ` · ถูกติดกันสูงสุด ${s.best} ข้อ` : ''}</p>` : ''}<div class="badges">${bs.map((b) => `<span class="badge b-${b.k}"><i>${b.icon}</i>${esc(b.th)}</span>`).join('')}</div></div>`));
      const wrongN = new Set(s.wrong).size;
      body.appendChild(el('<div class="card"><h2>วันนี้ได้อะไร</h2><ul class="list">' + [s.total ? `ตอบ ${s.total} ข้อ ถูกตั้งแต่ครั้งแรก ${s.right} ข้อ` : null, wrongN ? `${wrongN} ข้อจะกลับมาให้ทบทวน` : s.total ? 'ไม่มีข้อที่ต้องกลับมาทบทวนจากวันนี้' : null].filter(Boolean).map((t) => `<li><span class="tick" aria-hidden="true">✓</span><span>${t}</span></li>`).join('') + '</ul></div>'));
      if (card.classroom) {
        const c = el(`<div class="card"><h2>ประโยคพร้อมใช้</h2><p class="en">${esc(card.classroom.en)}</p><p class="small">${esc(card.classroom.th)}</p>${canSay() ? '<button class="btn quiet" id="sayClass">ฟังเสียงอ่าน</button>' : ''}</div>`);
        if (canSay()) c.querySelector('#sayClass').addEventListener('click', () => say(card.classroom.en, 0.9));
        body.appendChild(c);
      }
      const fin = el('<button class="btn" id="finishBtn">จบเซสชัน</button>');
      fin.addEventListener('click', async () => {
        fin.disabled = true; fin.textContent = 'กำลังบันทึก';
        const st = getStars(); st.stars += s.right; st.sessions++; st.best = Math.max(st.best, s.best || 0);
        if (s.total && s.right === s.total) st.perfect++; if (s.wrote) st.wrote++;
        for (const b of bs) st.badges[b.k] = (st.badges[b.k] || 0) + 1;
        const r = await flush({ kind: kindDone, minutes: mins }, st);
        if (!r || r.error) { fin.disabled = false; fin.textContent = 'บันทึกไม่สำเร็จ แตะเพื่อลองใหม่'; return; }   // ไม่ล้างเซสชันจนกว่าเซิร์ฟเวอร์รับ
        putStars(st);
        clearSession(); onExit('done', { right: s.right, total: s.total, minutes: mins, kind: kindDone });
      });
      body.appendChild(fin);
    }
    window.scrollTo(0, 0);
  }
  draw();
}
