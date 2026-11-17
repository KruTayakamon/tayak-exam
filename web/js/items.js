// ตัวแสดงข้อแต่ละชนิด · ทุกตัวเรียก done({answers:[{q,answer,correct}]}) เมื่อผู้เรียนตอบครบ · ตัวเลือกแสดงเป็น 1 2 3 4 (มติบอส 16 พ.ย.)
import { grade } from './engine/grade.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
/** ข้อความอธิบายภาษาไทยแบบ "โน้ตของเพื่อน": ==เหลือง== หลักสำคัญ · ++เขียว++ ทำแบบนี้ · ~~ชมพู~~ ระวัง (กติกา docs/writing/voice.md) */
export const rich = (s) => esc(s).replace(/==(.+?)==/g, '<mark class="hl y">$1</mark>').replace(/\+\+(.+?)\+\+/g, '<mark class="hl g">$1</mark>').replace(/~~(.+?)~~/g, '<mark class="hl p">$1</mark>');
const NOTE_TH = { pin: 'จำให้แม่น', warn: 'ระวังตรงนี้', tip: 'ทริกจำ', use: 'เอาไปใช้เลย' };
/** โน้ตแปะของบทเรียน · notes = [{kind, th}] */
export const notesHtml = (notes) => (notes || []).map((n, i) => `<div class="sticky k-${esc(n.kind)}${i % 2 ? ' r' : ''}"><span class="stk">${NOTE_TH[n.kind] || ''}</span><p>${rich(n.th)}</p></div>`).join('');
/** <k>..</k> ในตัวอย่างบทเรียน → ขีดเส้นใต้ */
export const mark = (s) => esc(s).replace(/&lt;k&gt;(.*?)&lt;\/k&gt;/g, '<u class="k">$1</u>');

const CAN_SAY = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
export const canSay = () => CAN_SAY;
/** เครื่องนี้มีเสียงอ่านของภาษานั้นหรือไม่ ('en' | 'th') · รายการเสียงบางเครื่องโหลดช้า ถ้ายังว่างให้ถือว่ามี แล้วให้เบราว์เซอร์เลือกเอง */
export function hasVoice(lang) {
  if (!CAN_SAY) return false;
  try { const v = speechSynthesis.getVoices(); return !v.length || v.some((x) => x.lang.toLowerCase().startsWith(lang)); } catch { return false; }
}
const speakOne = (text, lang, rate) => { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'th' ? 'th-TH' : 'en-GB'; u.rate = rate; speechSynthesis.speak(u); };
/** อ่านภาษาอังกฤษด้วยเสียงของเครื่อง · คืน false ถ้าเครื่องไม่มีเสียงอ่าน */
export function say(text, rate = 0.95) {
  if (!CAN_SAY) return false;
  try { speechSynthesis.cancel(); speakOne(text, 'en', rate); return true; } catch { return false; }
}
/** แบ่งข้อความปนไทยอังกฤษเป็นช่วง ๆ ตามภาษา (เสียงไทยอ่านคำอังกฤษเพี้ยน จึงให้เสียงอังกฤษอ่านส่วนอังกฤษ) */
export function splitLang(text) {
  const clean = String(text ?? '').replace(/==|\+\+|~~|<\/?k>/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const part of clean.match(/[\u0E00-\u0E7F][\u0E00-\u0E7F\s\d.,·()"]*|[^\u0E00-\u0E7F]+/g) || []) {
    const t = part.trim(); if (!t || !/[A-Za-z\u0E00-\u0E7F]/.test(t)) continue;
    const lang = /[\u0E00-\u0E7F]/.test(t) ? 'th' : 'en';
    if (out.length && out[out.length - 1].lang === lang) out[out.length - 1].text += ' ' + t; else out.push({ lang, text: t });
  }
  return out;
}
/** อ่านคำอธิบายที่ปนไทยอังกฤษ: ส่วนไทยใช้เสียงไทย ส่วนอังกฤษใช้เสียงอังกฤษ · คืน false ถ้าเครื่องไม่มีเสียงไทย */
export function sayMixed(text) {
  if (!CAN_SAY || !hasVoice('th')) return false;
  try { speechSynthesis.cancel(); for (const p of splitLang(text)) speakOne(p.text, p.lang, p.lang === 'th' ? 1 : 0.92); return true; } catch { return false; }
}
const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
/** ปุ่มลำโพงเล็ก อ่านภาษาอังกฤษ · ไม่แสดงถ้าเครื่องไม่มีเสียงอ่าน */
export function spk(text, label = 'ฟังเสียงอ่าน') {
  if (!CAN_SAY) return null;
  const b = el(`<button class="spk" type="button" aria-label="${esc(label)}" title="${esc(label)}">${ICON}</button>`);
  b.addEventListener('click', (e) => { e.stopPropagation(); say(text, 0.9); });
  return b;
}
/** ปุ่ม "ฟังคำอธิบาย" (ไทยปนอังกฤษ) · ถ้าเครื่องไม่มีเสียงไทย ปุ่มจะบอกแทนที่จะเงียบ */
export function spkThai(text, label = 'ฟังคำอธิบาย') {
  if (!CAN_SAY) return null;
  const b = el(`<button class="btn quiet spkth" type="button">${ICON}<span>${esc(label)}</span></button>`);
  b.addEventListener('click', () => { if (!sayMixed(text)) { b.querySelector('span').textContent = 'เครื่องนี้ไม่มีเสียงอ่านภาษาไทย'; b.disabled = true; } });
  return b;
}
/** เติมคำตอบที่ถูกลงในช่องว่างของโจทย์ เพื่ออ่านทั้งประโยค (ตัวเลือกแบบ "a / b" เติมทีละช่อง) */
export function filled(stem, answerText) {
  const parts = String(answerText).split(' / '); let i = 0;
  const blanks = (String(stem).match(/_{3,}/g) || []).length;
  if (!blanks || (parts.length !== blanks && parts.length !== 1)) return null;
  return String(stem).replace(/_{3,}/g, () => (parts.length === 1 ? parts[0] : parts[i++])).replace(/\s*—\s*.*$/, (m) => m);
}

/** หลังตอบแล้ว: ปุ่มฟังประโยคที่ถูกทั้งประโยค (ฝึกออกเสียงและเอาไปใช้สอน) · ไม่มีในข้อที่ประโยคปนภาษาไทย */
function addSayRight(host, sentence) {
  if (!CAN_SAY || !sentence || /[\u0E00-\u0E7F]/.test(sentence)) return;
  const b = el(`<button class="btn quiet" id="sayRight" type="button">${ICON}<span>ฟังประโยคที่ถูก</span></button>`);
  b.addEventListener('click', () => say(sentence.replace(/"/g, ''), 0.9));
  host.appendChild(b);
}

/** คำถามเลือกตอบหนึ่งข้อ: แตะแล้วเฉลยทันทีพร้อมเหตุผลของทุกตัวเลือก */
function mcqBlock(q, onAnswer) {
  const box = el('<div class="screen"></div>');
  q.choices.forEach((c, i) => {
    const b = el(`<button class="opt" data-choice="${i}"><b>${i + 1}</b><span><span class="ct">${esc(c.t)}</span></span></button>`);
    b.addEventListener('click', () => {
      if (box.dataset.done) return;
      box.dataset.done = '1';
      const ok = i === q.answer;
      [...box.querySelectorAll('.opt')].forEach((o, j) => {
        o.disabled = true;
        const isKey = j === q.answer, picked = j === i;
        if (isKey) o.classList.add('ok'); else if (picked) o.classList.add('bad'); else o.classList.add('dim');
        const tag = isKey ? (picked ? '✓ คำตอบของคุณ ถูกต้อง' : '✓ คำตอบที่ถูก') : picked ? '✕ คำตอบของคุณ ยังไม่ถูก' : '';
        const sp = o.querySelector('span');
        if (tag) sp.insertAdjacentHTML('beforeend', ` <span class="mark">${tag}</span>`);
        sp.insertAdjacentHTML('beforeend', `<div class="why">${rich(q.choices[j].why)}</div>`);
      });
      onAnswer(i, ok);
    });
    box.appendChild(b);
  });
  return box;
}

function contextOf(it) {
  if (it.kind === 'read') return `<div class="card">${it.title ? `<h2 class="en">${esc(it.title)}</h2>` : ''}<div class="en box">${String(it.passage).trim().split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join('')}</div></div>`;
  if (it.kind === 'cloze') return `<div class="card"><div class="en box"><pre>${esc(String(it.text).trim())}</pre></div></div>`;
  return '';
}

/** แสดงข้อหนึ่งข้อลงใน host · opts.onReport(id) · done(result) */
export function renderItem(host, it, done, opts = {}) {
  host.innerHTML = '';
  host.dataset.item = it.id;                       // ใช้โดยเทสต์และการรายงานข้อ (รหัสข้อไม่ใช่ความลับ)
  const answers = [];
  const finish = () => done({ id: it.id, answers });
  if (it.kind === 'mcq') {
    host.appendChild(el(`<p class="en">${esc(it.stem)}</p>`));
    host.appendChild(mcqBlock(it, (a, ok) => { answers.push({ q: 0, answer: a, correct: ok }); if (it.explain) host.appendChild(el(`<p class="small">หลักที่ควรจำ: ${rich(it.explain)}</p>`)); addSayRight(host, filled(it.stem, it.choices[it.answer].t)); finish(); }));
  } else if (it.kind === 'type') {
    host.appendChild(el(`<p class="en">${esc(it.stem)}</p>`));
    const f = el('<form class="screen"><label class="field">พิมพ์คำตอบ<input id="typeIn" autocomplete="off" autocapitalize="none" spellcheck="false"></label><button class="btn" type="submit">ตรวจคำตอบ</button></form>');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = f.querySelector('input').value; if (!v.trim()) return;
      const ok = grade(it, 0, v);
      f.querySelector('input').disabled = true; f.querySelector('button').remove();
      f.appendChild(el(`<div class="fb ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓ ถูกต้อง' : '✕ ยังไม่ถูก'}</b><span>คำตอบ: <span class="en"><b>${esc(it.answer)}</b></span></span><span>${rich(it.why)}</span></div>`));
      addSayRight(host, filled(it.stem.replace(/[a-z]_{3,}/i, '____').replace(/\s*\([^)]*[\u0E00-\u0E7F][^)]*\)\s*$/, ''), it.answer));
      answers.push({ q: 0, answer: v, correct: ok }); finish();
    });
    host.appendChild(f);
  } else if (it.kind === 'order') {
    const pool = it.chunks.map((c, i) => ({ c, i })).sort((a, b) => ((a.i * 7 + it.id.length) % it.chunks.length) - ((b.i * 7 + it.id.length) % it.chunks.length));
    if (pool.every((p, k) => p.i === k)) pool.reverse();          // กันกรณีสลับแล้วได้ลำดับเดิม
    const picked = [];
    host.appendChild(el(`<p class="small">แตะคำตามลำดับเพื่อเรียงเป็นประโยค · ${esc(it.th)}</p>`));
    const out = el('<div class="chunks" id="orderOut" aria-label="ประโยคของคุณ"></div>'), src = el('<div class="chunks" id="orderSrc"></div>');
    const btn = el('<button class="btn" disabled>ตรวจคำตอบ</button>');
    const draw = () => {
      out.innerHTML = ''; src.innerHTML = '';
      picked.forEach((p, k) => { const b = el(`<button class="chunk">${esc(p.c)}</button>`); b.addEventListener('click', () => { if (out.dataset.done) return; picked.splice(k, 1); draw(); }); out.appendChild(b); });
      pool.forEach((p) => { const b = el(`<button class="chunk" ${picked.includes(p) ? 'disabled' : ''}>${esc(p.c)}</button>`); b.addEventListener('click', () => { if (out.dataset.done) return; picked.push(p); draw(); }); src.appendChild(b); });
      btn.disabled = picked.length !== pool.length;
    };
    btn.addEventListener('click', () => {
      const ans = picked.map((p) => p.c), ok = grade(it, 0, ans);
      out.dataset.done = '1'; btn.remove();
      host.appendChild(el(`<div class="fb ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓ ถูกต้อง' : '✕ ยังไม่ถูก'}</b><span class="en">${esc(it.sentence)}</span><span>${rich(it.why)}</span></div>`));
      addSayRight(host, it.sentence);
      answers.push({ q: 0, answer: ans, correct: ok }); finish();
    });
    host.append(out, src, btn); draw();
  } else {                                                            // cloze · read · listen: บริบทร่วม + คำถามย่อยทีละข้อ
    if (it.kind === 'listen') {
      const text = it.script.map((l) => l.en).join(' ... ');
      const card = el(`<div class="card"><p class="small">ฟังแล้วตอบคำถาม ฟังได้ 2 ครั้ง</p><div class="row"><button class="btn quiet" id="play">ฟัง (เหลือ 2)</button><button class="btn quiet" id="slow">ฟังช้า ๆ</button></div><div id="script" hidden class="en box"></div></div>`);
      let left = 2;
      const show = () => { const s = card.querySelector('#script'); s.hidden = false; s.innerHTML = it.script.map((l) => `<p><b>${esc(l.who)}:</b> ${esc(l.en)}</p>`).join(''); };
      const play = (rate) => { if (left <= 0) return; if (!say(text, rate)) { show(); return; } left--; card.querySelector('#play').textContent = `ฟัง (เหลือ ${left})`; if (left <= 0) { card.querySelector('#play').disabled = true; card.querySelector('#slow').disabled = true; } };
      card.querySelector('#play').addEventListener('click', () => play(0.95));
      card.querySelector('#slow').addEventListener('click', () => play(0.7));
      if (!canSay()) show();                                           // เครื่องไม่มีเสียงอ่าน: แสดงบทให้อ่านแทน
      host.appendChild(card);
      host._showScript = show;
    } else host.insertAdjacentHTML('beforeend', contextOf(it));
    const qHost = el('<div class="screen"></div>'); host.appendChild(qHost);
    let n = 0;
    const next = () => {
      const q = it.questions[n], label = it.kind === 'cloze' ? `ช่องที่ (${n + 1})` : esc(q.stem);
      qHost.appendChild(el(`<p class="${it.kind === 'cloze' ? 'small' : 'en'}">${label}</p>`));
      qHost.appendChild(mcqBlock(q, (a, ok) => {
        answers.push({ q: n, answer: a, correct: ok }); n++;
        if (n < it.questions.length) next(); else { if (host._showScript) host._showScript(); finish(); }
      }));
    };
    next();
  }
  if (opts.onReport) {
    const r = el('<button class="link" id="reportBtn">รายงานข้อนี้</button>');
    r.addEventListener('click', () => { opts.onReport(it.id); r.textContent = 'รายงานแล้ว ขอบคุณครับ'; r.disabled = true; });
    host.appendChild(r);
  }
}
