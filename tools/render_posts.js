// วาดภาพโพสต์ 1080×1350 จาก build/posts.json → marketing/out/<รหัส>.png · เรียกจาก tools/make_posts.py
// แม่แบบเดียวกับ marketing/mock/post_mock.html (สีและตัวอักษรชุดเดียวกับเว็บ) · ห้ามใช้ text-shadow กับข้อความไทย
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'posts.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rich = (s) => esc(s).replace(/==(.+?)==/g, '<mark>$1</mark>').replace(/\+\+(.+?)\+\+/g, '<mark class="g">$1</mark>').replace(/~~(.+?)~~/g, '<mark class="p">$1</mark>');
const FOOT = { quiz: 'ตอบแล้วดูเหตุผลทุกตัวเลือก', word: 'ฟังเสียงอ่านและฝึกคำนี้ต่อ', trap: 'ฝึกจุดนี้ต่ออีก 4 ข้อ', class: 'ฟังเสียงอ่านและฝึกต่อ', tip: 'ลองใช้เทคนิคนี้ 4 ข้อ', recap: 'วัดระดับฟรี 20 นาที' };

const CSS = `*{box-sizing:border-box;margin:0}
body{background:#F5F7F8;font-family:"IBM Plex Sans Thai","Noto Sans Thai",sans-serif;color:#12233F}
.post{width:1080px;height:1350px;background:#F5F7F8;padding:72px;display:flex;flex-direction:column;gap:36px}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:700;font-size:40px}.brand small{font-weight:400;font-size:26px;color:#51607A;margin-left:10px}
.lv{background:#0B6B5B;color:#fff;border-radius:999px;padding:10px 28px;font-size:30px;font-weight:600}
.head{font-size:54px;font-weight:700;line-height:1.3}
.card{background:#fff;border:2px solid #D7DEE6;border-radius:28px;padding:48px;display:flex;flex-direction:column;gap:28px}
.en{font-family:"IBM Plex Serif",Georgia,serif;font-size:48px;line-height:1.45}
.big{font-family:"IBM Plex Serif",Georgia,serif;font-size:96px;font-weight:600;line-height:1.1}
.pos{font-size:32px;color:#51607A}.mean{font-size:44px;font-weight:600}
.opt{display:flex;gap:24px;align-items:center;border:2px solid #D7DEE6;border-radius:20px;padding:20px 28px;font-family:"IBM Plex Serif",serif;font-size:42px}
.n{width:60px;height:60px;border-radius:50%;background:#DDEFEA;color:#0B6B5B;display:grid;place-items:center;font-family:"IBM Plex Sans Thai";font-weight:700;font-size:34px;flex:none}
.foot{margin-top:auto;background:#12233F;color:#fff;border-radius:24px;padding:30px 40px;font-size:36px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:20px}
.foot span{color:#B9EFC5;font-weight:400;font-size:30px;white-space:nowrap}
.bad{background:#FBE6E3;border-radius:20px;padding:28px 34px}.good{background:#E1F3E8;border-radius:20px;padding:28px 34px}
.tag{font-size:28px;font-weight:600;margin-bottom:8px}.bad .tag{color:#B3372F}.good .tag{color:#17794A}
.sticky{margin-top:14px;background:#FFF6C2;color:#3A3320;padding:36px 40px;font-size:38px;line-height:1.6;transform:rotate(-1.2deg);position:relative;box-shadow:0 6px 0 #e6dca3}
.sticky:before{content:"";position:absolute;top:-18px;left:50%;width:150px;height:36px;margin-left:-75px;background:#F2A65A;opacity:.85}
mark{background:#FFE873;color:inherit;padding:0 8px;border-radius:6px}mark.g{background:#B9EFC5}mark.p{background:#FFC9D6}
.row{display:flex;flex-direction:column;gap:6px;border-bottom:2px dashed #D7DEE6;padding-bottom:24px}.row:last-child{border:0;padding:0}
.th{font-size:34px;color:#51607A}`;

function body(p) {
  const top = `<div class="top"><div class="brand">CEFR for Kru<small>by TAYAK</small></div><div class="lv">${esc(p.course.toUpperCase())}</div></div><div class="head">${esc(p.head)}</div>`;
  let mid = '';
  const lines = (ls) => (ls || []).map((l) => `<div class="row"><div class="en">${esc(l.en)}</div><div class="th">${esc(l.th)}</div></div>`).join('');
  if (p.type === 'quiz') mid = `<div class="card"><div class="en">${esc(p.stem)}</div>${p.image_choices.map((c, i) => `<div class="opt"><div class="n">${i + 1}</div>${esc(c)}</div>`).join('')}</div>`;
  if (p.type === 'word') mid = `<div class="card"><div><div class="big">${esc(p.word)}</div><div class="pos">${esc(p.pos)}</div></div><div class="mean">${esc(p.th)}</div><div class="row"><div class="en">${esc(p.example)}</div><div class="th">${esc(p.example_th)}</div></div></div>`;
  if (p.type === 'trap') mid = `<div class="card"><div class="bad"><div class="tag">พูดแบบนี้กันบ่อย</div><div class="en">${esc(p.wrong)}</div></div><div class="good"><div class="tag">ที่ถูกคือ</div><div class="en">${esc(p.right)}</div></div></div><div class="sticky">${rich(p.note)}</div>`;
  if (p.type === 'class') mid = `<div class="card">${lines(p.lines)}</div>`;
  if (p.type === 'tip') mid = `<div class="sticky">${rich(p.note)}</div>${p.lines && p.lines.length ? `<div class="card">${lines(p.lines)}</div>` : ''}`;
  if (p.type === 'recap') mid = `<div class="sticky">${rich(p.note)}</div><div class="card"><div class="mean">วัดระดับฟรี</div>${['25 ข้อ ประมาณ 20 นาที', 'ไม่ต้องสมัคร รู้ผลทันที', 'บอกว่าทักษะไหนต้องฝึกก่อน', 'เรียนสัปดาห์แรกฟรีทั้งสัปดาห์'].map((t) => `<div class="th">✓ ${t}</div>`).join('')}</div>`;
  return `<div class="post" id="post">${top}${mid}<div class="foot">${FOOT[p.type]}<span>ลิงก์ในโพสต์${p.type === 'quiz' ? ' · ไม่ต้องสมัคร' : ''}</span></div></div>`;
}

(async () => {
  const out = path.join(ROOT, 'marketing', 'out'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  let bad = 0;
  for (const p of data.posts) {
    await page.setContent(`<!doctype html><html lang="th"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Serif:wght@400;600&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${body(p)}</body></html>`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    // ข้อความล้นกรอบ = ภาพเสีย: ตรวจว่าแถบลิงก์ด้านล่างยังอยู่ในภาพ
    const over = await page.evaluate(() => { const f = document.querySelector('.foot').getBoundingClientRect(); const c = document.querySelector('#post'); return f.bottom > 1350 - 40 || c.scrollHeight > 1350; });
    if (over) { bad++; console.log(`ภาพล้น: ${p.id} (ข้อความยาวเกิน ตัดให้สั้นลง)`); }
    await page.locator('#post').screenshot({ path: path.join(out, p.id + '.png') });
  }
  await b.close();
  console.log(`ภาพ ${data.posts.length} ใบ → marketing/out/`);
  process.exit(bad ? 1 : 0);
})();
