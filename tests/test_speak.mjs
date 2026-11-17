// เทสต์ส่วนที่เป็นตรรกะของการอ่านให้ฟัง · รัน: node tests/test_speak.mjs
import fs from 'node:fs';
// items.js ใช้ document ตอนเรียก el() เท่านั้น ฟังก์ชันที่ทดสอบไม่แตะ DOM
const src = fs.readFileSync(new URL('../web/js/items.js', import.meta.url), 'utf8').replace(/^import .*$/m, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
let fails = 0;
const eq = (a, b, name) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  ได้ ${JSON.stringify(a)} ควรเป็น ${JSON.stringify(b)}`)); if (!ok) fails++; };
eq(mod.splitLang('เรื่องที่ทำเป็นประจำ ใช้ ==present simple== ส่วนเรื่องที่กำลังทำ ใช้ ==present continuous== (am/is/are + กริยา -ing)').map((x) => x.lang), ['th', 'en', 'th', 'en', 'th', 'en'], 'แบ่งข้อความปนไทยอังกฤษตามภาษา และตัดเครื่องหมายไฮไลต์ออก');
eq(mod.splitLang('==จำ== ++ทำ++ ~~ระวัง~~').map((x) => x.text).join(' ').includes('='), false, 'ไม่อ่านเครื่องหมายไฮไลต์');
eq(mod.splitLang('I <k>teach</k> maths.'), [{ lang: 'en', text: 'I teach maths.' }], 'ตัดเครื่องหมายขีดเส้นใต้ออก');
eq(mod.filled('Water ____ at 100 degrees Celsius.', 'boils'), 'Water boils at 100 degrees Celsius.', 'เติมคำตอบลงช่องว่าง');
eq(mod.filled('I usually ____ to school, but this week I ____ a car.', 'go / am using'), 'I usually go to school, but this week I am using a car.', 'เติมสองช่องจากตัวเลือกแบบ a / b');
eq(mod.filled('No blank here.', 'x'), null, 'ไม่มีช่องว่าง ไม่มีปุ่มฟัง');
eq(mod.filled('A ____ B ____ C ____', 'x / y'), null, 'จำนวนช่องไม่ตรงกับคำตอบ ไม่เดา');
eq(typeof mod.say('x'), 'boolean', 'เครื่องที่ไม่มีเสียงอ่าน: say คืน false ไม่พัง');
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
