// เทสต์เส้นทางหลักของแอปผู้เรียนบนรุ่นสาธิต จอมือถือ 390 · รัน: python3 bank/build.py && python3 build.py --demo && python3 build.py --bundle && node tests/test_app.js
// ครอบคลุม: ตั้งแผน → เซสชันวันที่ 1 (ตอบผิด 1 ข้อ) → โหลดหน้าใหม่กลางคันแล้วทำต่อ → จบ → ข้ามวัน → เซสชันสั้นทบทวนข้อที่ผิด → วันที่ 2–6 ครบทุกชนิดข้อ → รุ่นไฟล์เดียว
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SHOTS = path.join(__dirname, 'shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
let fails = 0;
const ok = (c, name) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };

/** ตอบการ์ดปัจจุบันแล้วไปต่อ · wrong = จงใจตอบผิด (เฉพาะข้อเลือกตอบ) · คืนชนิดของการ์ด */
async function step(p, wrong = false) {
  const kind = await p.evaluate((wrong) => {
    const host = document.querySelector('[data-item]');
    if (document.querySelector('#finishBtn')) return 'close';
    if (!host || !document.body.contains(host)) return 'other';
    const it = window.DEMO_DATA.items[host.dataset.item];
    if (it.kind === 'mcq') { host.querySelector(`.opt[data-choice="${wrong ? (it.answer + 1) % 4 : it.answer}"]`).click(); return 'mcq'; }
    if (it.kind === 'type') { host.querySelector('#typeIn').value = it.answer; host.querySelector('form').requestSubmit(); return 'type'; }
    if (it.kind === 'order') {
      for (const c of it.chunks) [...host.querySelectorAll('#orderSrc .chunk')].find((b) => !b.disabled && b.textContent === c).click();
      [...host.querySelectorAll('.btn')].find((b) => b.textContent === 'ตรวจคำตอบ').click(); return 'order';
    }
    it.questions.forEach((q) => { const blocks = [...host.querySelectorAll('.screen')].filter((b) => b.querySelector(':scope > .opt') && !b.dataset.done); blocks[0].querySelector(`.opt[data-choice="${q.answer}"]`).click(); });
    return it.kind;
  }, wrong);
  if (kind === 'close') return kind;
  await p.click('#nextBtn');
  return kind;
}
async function runSession(p, wrongAt = -1) {
  const seen = {}; let n = 0;
  for (let i = 0; i < 80; i++) { const k = await step(p, n === wrongAt); seen[k] = (seen[k] || 0) + 1; if (k === 'close') break; if (k !== 'other') n++; }
  return seen;
}
const finish = async (p) => { await p.click('#finishBtn'); await p.waitForSelector('#shortBtn'); };   // ปุ่มนี้มีเฉพาะหน้าวันนี้
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('cfk-demo')));
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });   // ERR_FAILED = ฟอนต์ภายนอกที่เทสต์ปิดเอง
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());       // เทสต์ไม่พึ่งเครือข่ายภายนอก

  await p.goto(base + '/dist-demo/app.html'); await p.waitForSelector('#usePlan');
  ok(true, 'เปิดครั้งแรกเจอหน้าตั้งแผน'); await p.click('#usePlan'); await p.waitForSelector('#todayTitle');
  ok((await p.textContent('#todayTitle')).includes('วันที่ 1'), 'หน้าวันนี้แสดงวันที่ 1');
  ok(await p.$eval('#shortBtn', (x) => x.disabled), 'ยังไม่มีข้อทบทวน ปุ่มเซสชันสั้นกดไม่ได้');
  ok(await noOverflow(p), 'หน้าวันนี้ไม่ล้นจอ 390'); await p.screenshot({ path: path.join(SHOTS, 'app_today.png'), fullPage: true });

  await p.click('#startBtn'); await p.waitForSelector('#stepLabel');
  ok((await p.textContent('#stepLabel')).includes('ขั้น 2 จาก 5'), 'วันแรกไม่มีข้อทบทวน เริ่มที่ขั้นเรียน');
  await p.screenshot({ path: path.join(SHOTS, 'app_learn.png'), fullPage: true });
  ok(await p.$$eval('.sticky', (x) => x.length) === 2 && await p.$$eval('h2.rule mark.hl.y', (x) => x.length) === 2, 'บทเรียนมีโน้ตแปะ 2 ใบ และไฮไลต์เหลืองในกติกา');
  ok(await p.$$eval('.ex .spk', (x) => x.length) === 4 && await p.$('.spkth') !== null, 'บทเรียนมีปุ่มฟังประโยคตัวอย่างครบ 4 ประโยค และปุ่มฟังคำอธิบาย');
  ok(await p.evaluate(() => { const b = document.querySelector('.ex .spk'); const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }), 'ปุ่มลำโพงใหญ่พอสำหรับนิ้ว (44px)');
  await step(p);                                                      // บทเรียน
  await step(p); await step(p);                                       // ข้อเช็ก 2 ข้อ
  await step(p, true);                                                // ข้อฝึกข้อแรก: ตอบผิด
  ok((await p.textContent('#stepLabel')).includes('ฝึก'), 'อยู่ในขั้นฝึก');
  await p.evaluate(() => document.querySelector('[data-item] .opt[data-choice="0"]').click());
  ok(await p.$$eval('[data-item] .why', (w) => w.length === 4), 'ตอบแล้วเห็นเหตุผลของทั้ง 4 ตัวเลือก');
  ok(await p.$$eval('[data-item] .why mark.hl', (x) => x.length) >= 1 && !(await p.textContent('[data-item]')).includes('++'), 'เหตุผลมีไฮไลต์ และไม่มีเครื่องหมายดิบหลุดออกมา');
  ok(await p.$('#sayRight') !== null, 'หลังตอบมีปุ่มฟังประโยคที่ถูก');
  ok(await p.$$eval('[data-item] .opt b', (bs) => bs.map((x) => x.textContent).join('') === '1234'), 'ตัวเลือกแสดงเป็น 1 2 3 4');
  ok(await noOverflow(p), 'หน้าข้อฝึกไม่ล้นจอ 390'); await p.screenshot({ path: path.join(SHOTS, 'app_item.png'), fullPage: true });
  const labelBefore = await p.textContent('#stepLabel');
  await p.click('#exitBtn'); await p.waitForSelector('#startBtn');
  ok((await p.textContent('#startBtn')).includes('ทำต่อจากที่ค้าง'), 'กดออกกลางเซสชัน ปุ่มหน้าวันนี้เปลี่ยนเป็นทำต่อจากที่ค้าง');
  await p.click('#startBtn'); await p.waitForSelector('#stepLabel');
  ok((await p.textContent('#stepLabel')) === labelBefore, 'ทำต่อแล้วกลับมาที่ขั้นเดิม');
  await p.reload(); await p.waitForSelector('#stepLabel');
  ok((await p.textContent('#stepLabel')) === labelBefore, 'โหลดหน้าใหม่กลางเซสชัน กลับเข้าเซสชันเดิมที่ขั้นเดิม');
  await p.evaluate(() => document.querySelector('[data-item] .opt[data-choice="0"]')?.click());   // ข้อที่ค้างอยู่ต้องตอบใหม่หลังโหลดหน้า
  const s1 = await runSession(p);
  ok(s1.close === 1, 'เดินถึงหน้าสรุป'); ok((await p.textContent('#sumScore')).includes('จาก 12 ข้อ'), 'สรุปนับ 12 ข้อ (เช็ก 2 + ฝึก 10) ไม่นับซ้ำหลังโหลดหน้าใหม่');
  await p.screenshot({ path: path.join(SHOTS, 'app_close.png'), fullPage: true });
  await finish(p);
  ok((await p.textContent('#todayTitle')).includes('วันที่ 2'), 'จบแล้วตัวชี้ขยับเป็นวันที่ 2');
  ok((await p.textContent('#weekCount')).includes('1 จาก 5'), 'เป้าสัปดาห์นับ 1 วัน');
  let st = await state(p); const wrongIds = Object.entries(st.states).filter(([, v]) => v.wrong > 0).map(([k]) => k);
  ok(wrongIds.length >= 1 && wrongIds.every((id) => st.states[id].box === 1), 'ข้อที่ผิดเข้าคิวทบทวนขั้น 1');
  ok(st.events.length === 12 && (await p.evaluate(() => JSON.parse(localStorage.getItem('cfk-queue') || '[]').length)) === 0, 'เซิร์ฟเวอร์จำลองรับครบ 12 คำตอบ และคิวในเครื่องว่าง');
  ok(st.events.filter((e) => !e.correct).length === wrongIds.length, 'เซิร์ฟเวอร์ตรวจคำตอบเอง ได้จำนวนข้อผิดตรงกัน');

  await p.click('#accountLink'); await p.click('#demoNext'); await p.waitForSelector('#shortBtn');
  ok(!(await p.$eval('#shortBtn', (x) => x.disabled)) && (await p.textContent('#shortBtn')).includes(`${wrongIds.length} ข้อถึงกำหนด`), 'วันถัดไป ข้อที่ผิดถึงกำหนดทบทวน');
  await p.click('#shortBtn'); await p.waitForSelector('#stepLabel');
  const sShort = await runSession(p); await finish(p);
  ok(sShort.mcq === wrongIds.length && (await p.textContent('#todayTitle')).includes('วันที่ 2'), 'เซสชันสั้นมีแต่ข้อทบทวน และไม่ขยับบทเรียน');
  st = await state(p); ok(wrongIds.every((id) => st.states[id].box === 2), 'ตอบถูกเมื่อถึงกำหนด เลื่อนเป็นขั้น 2');

  const kinds = {};
  for (let d = 2; d <= 6; d++) {
    await p.click('#startBtn'); await p.waitForSelector('#stepLabel');
    if (d === 4) { await p.waitForSelector('[data-item], #nextBtn'); }
    const k = await runSession(p); Object.assign(kinds, k);
    if (d === 5) await p.screenshot({ path: path.join(SHOTS, 'app_lab_close.png'), fullPage: true });
    await finish(p);
  }
  ok(['mcq', 'type', 'cloze', 'read', 'listen', 'order'].every((k) => kinds[k]), `เล่นครบทุกชนิดข้อ ${JSON.stringify(kinds)}`);
  ok((await p.textContent('#view')).includes('จบเนื้อหาที่มีแล้ว'), 'จบสัปดาห์ 1 แล้วบอกว่ายังไม่มีสัปดาห์ถัดไป');
  st = await state(p); ok(st.enrol.week === 2 && st.enrol.day === 1 && st.sessions.filter((x) => x.kind !== 'short').length === 6, 'ทำครบ 6 เซสชันของสัปดาห์');
  for (const r of ['course', 'extra', 'results', 'buy', 'account']) { await p.goto(base + '/dist-demo/app.html#' + r); await p.waitForSelector('#view h1'); ok(await noOverflow(p), `หน้า ${r} เปิดได้และไม่ล้นจอ`); }
  await p.goto(base + '/dist-demo/app.html#results'); await p.waitForSelector('#view h1'); await p.screenshot({ path: path.join(SHOTS, 'app_results.png'), fullPage: true });
  await p.goto(base + '/dist-demo/app.html#buy'); await p.waitForSelector('.price');
  ok((await p.textContent('#view')).includes('290 บาท') && (await p.textContent('#view')).includes('690 บาท'), 'หน้าราคาแสดงราคาเปิดตัวจากโมดูลราคา');

  // แบบวัดระดับ (ไม่ต้องล็อกอิน): ทำครบ ตอบถูกทุกข้อ → ผ่าน C1 แน่น แนะนำ C2 · ระหว่างทำไม่เห็นเฉลย
  const pl = await ctx.newPage(); pl.on('pageerror', (e) => errs.push('placement: ' + e));
  await pl.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pl.goto(base + '/dist-demo/placement.html'); await pl.waitForSelector('#start'); await pl.click('#start');
  const key = await pl.evaluate(() => Object.fromEntries(Object.values(globalThis.DEMO_DATA.items).filter((i) => i.band).flatMap((i) => i.questions ? i.questions.map((q, n) => [i.questions.length > 1 ? i.id + ':' + n : i.id, q.answer]) : [[i.id, i.answer]])));
  let screens = 0, sawWhy = false;
  for (;;) {
    await pl.waitForSelector('#next');
    for (const q of await pl.$$eval('[data-q]', (x) => x.map((e) => e.dataset.q))) await pl.click(`[data-q="${q}"] .opt[data-choice="${key[q]}"]`);
    sawWhy = sawWhy || (await pl.$('.why')) !== null;
    const last = (await pl.textContent('#next')).includes('ส่ง'); await pl.click('#next'); screens++; if (last) break;
  }
  await pl.waitForSelector('#level');
  ok(screens === 23 && !sawWhy, 'แบบวัดระดับมี 23 หน้าจอ (25 คะแนน) และไม่แสดงเหตุผลระหว่างทำ');
  const lv = await pl.getAttribute('#view', 'data-level'), pn = await pl.textContent('#plan'), sc = await pl.getAttribute('#view', 'data-scores');
  ok(lv === 'c1' && pn === 'C2', 'ตอบถูกทุกข้อ ได้ผล C1 และแนะนำคอร์ส C2 ' + JSON.stringify([lv, pn, sc]));
  ok(await noOverflow(pl), 'หน้าผลวัดระดับไม่ล้นจอ'); await pl.screenshot({ path: path.join(SHOTS, 'placement_result.png'), fullPage: true });
  // หน้าโพสต์ที่อนุมัติแล้วอยู่ในเว็บจริง และปุ่มวัดระดับพาไปหน้าวัดระดับ
  await pl.goto(base + '/dist/p/mk-quiz-0002/index.html'); await pl.waitForSelector('#q0 .opt'); await pl.click('#q0 .opt'); await pl.click('#moreBtn');
  for (let k = 1; k <= 4; k++) { await pl.click(`[data-set="${k}"] .opt`); await pl.click(`[data-set="${k}"] .next`); }
  ok((await pl.getAttribute('#goPlacement', 'href')) === '../../placement.html', 'ปุ่มวัดระดับในหน้าโพสต์พาไปหน้าวัดระดับ');

  // รุ่นไฟล์เดียว (ที่ publish เป็น artifact): ห่อด้วยโครงหน้าแบบเดียวกับที่ artifact ทำ
  const bundle = fs.readFileSync(path.join(ROOT, 'build', 'demo_bundle.html'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'build', 'bundle_test.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + bundle + '</body></html>');
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push('bundle: ' + e));
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p2.goto(base + '/build/bundle_test.html'); await p2.evaluate(() => localStorage.clear()); await p2.reload();
  await p2.waitForSelector('#usePlan'); await p2.click('#usePlan'); await p2.waitForSelector('#startBtn'); await p2.click('#startBtn'); await p2.waitForSelector('#stepLabel');
  await step(p2); await step(p2);
  ok(await p2.$('[data-item]') !== null, 'รุ่นไฟล์เดียวเล่นเซสชันได้');
  // เบราว์เซอร์ที่ไม่ให้ใช้ที่เก็บในเครื่อง: แอปต้องยังเรียนได้ด้วยที่เก็บสำรองในหน่วยความจำ
  const p4 = await ctx.newPage(); p4.on('pageerror', (e) => errs.push('nostore: ' + e));
  await p4.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p4.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p4.goto(base + '/dist-demo/app.html'); await p4.waitForSelector('#usePlan'); await p4.click('#usePlan'); await p4.waitForSelector('#startBtn');
  await p4.click('#startBtn'); await p4.waitForSelector('#stepLabel'); await step(p4); await step(p4);
  ok(await p4.$('[data-item]') !== null, 'ไม่มีที่เก็บในเครื่องก็ยังเริ่มเรียนได้');
  ok(await p4.$$eval('.sticky', (x) => x.length) === 0 && true, 'หน้าข้อไม่มีโน้ตแปะ (โน้ตแปะอยู่เฉพาะบทเรียน)');
  // เว็บจริง (ไม่มีข้อมูล): ต้องไม่มีเนื้อหา และเปิดได้โดยไม่พัง
  const p3 = await ctx.newPage(); const e3 = []; p3.on('pageerror', (e) => e3.push(String(e)));
  await p3.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p3.goto(base + '/dist/app.html'); await p3.waitForSelector('#goPlacement');
  ok(e3.length === 0 && (await p3.evaluate(() => typeof window.DEMO_DATA)) === 'undefined', 'เว็บจริงไม่มีข้อมูลสาธิตฝังอยู่ และไม่มีข้อผิดพลาดตอนเปิด');
  ok(errs.length === 0, 'ไม่มีข้อผิดพลาดในคอนโซล ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); server.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
