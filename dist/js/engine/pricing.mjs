// ราคาและสิทธิ์ของ CEFR for You · ฟังก์ชันล้วน · เซิร์ฟเวอร์เป็นผู้คำนวณเสมอ หน้าเว็บแสดงผลอย่างเดียว
// มติบอส 16 พ.ย. 2569: 1 คอร์ส 6 เดือน 490 (เปิดตัว 290) · ทุกคอร์ส 12 เดือน 990 (เปิดตัว 690) · ต่อเวลา 3 เดือน 150
// คืนเงินภายใน 7 วันถ้าทำไม่เกิน 3 เซสชัน · ข้อรับรองความคุ้มค่า: ต่อเวลาฟรี 3 เดือน ครั้งเดียวต่อคอร์ส
// เทสต์: tests/test_pricing.mjs · จะเปลี่ยนตัวเลขใดต้องมีมติบอสและบันทึกใน CLAUDE.md

const DAY = 86400000;
export const COURSES = ['a2', 'b1', 'b2', 'c1', 'c2'];
export const PRODUCTS = {
  'cefr-a2': { kind: 'course', course: 'a2', days: 180, baht: 490, launch: 290, th: 'คอร์สปูพื้นสู่ A2' },
  'cefr-b1': { kind: 'course', course: 'b1', days: 180, baht: 490, launch: 290, th: 'คอร์สเป้าหมาย B1' },
  'cefr-b2': { kind: 'course', course: 'b2', days: 180, baht: 490, launch: 290, th: 'คอร์สเป้าหมาย B2' },
  'cefr-c1': { kind: 'course', course: 'c1', days: 180, baht: 490, launch: 290, th: 'คอร์สเป้าหมาย C1' },
  'cefr-c2': { kind: 'course', course: 'c2', days: 180, baht: 490, launch: 290, th: 'คอร์สเป้าหมาย C2' },
  'cefr-all': { kind: 'all', days: 365, baht: 990, launch: 690, th: 'ทุกคอร์ส 12 เดือน' },
  'cefr-extend': { kind: 'extend', days: 90, baht: 150, launch: 150, th: 'ต่อเวลา 3 เดือน' },
};
export const RULES = {
  launch_until: null,            // null = ราคาเปิดตัวยังใช้อยู่จนกว่าบอสกำหนดวันสิ้นสุด (ISO date) · หลังวันนั้นใช้ราคาปกติ
  refund_days: 7, refund_max_sessions: 3,
  guarantee_days: 90,
  free_weeks: 1,                 // มติบอส 17 พ.ย. 2569: สัปดาห์ที่ 1 ของทุกคอร์สเรียนฟรีทั้งสัปดาห์ (ต้องล็อกอิน) · เจ้าของปรับได้ 0–2
  extend_grace_days: 90,         // ต่อเวลาได้แม้สิทธิ์หมดไปแล้วไม่เกินกี่วัน
};

export const launchOn = (now, rules = RULES) => rules.launch_until == null || now < Date.parse(rules.launch_until);

/** ราคาที่ต้องจ่ายตอนนี้ */
export function quote(product, now, rules = RULES, products = PRODUCTS) {
  const P = products[product];
  if (!P) return null;
  const launch = launchOn(now, rules) && P.launch < P.baht;
  return { product, th: P.th, list: P.baht, amount: launch ? P.launch : P.baht, launch, days: P.days };
}

/** ents = [{product, expires_at(ms)}] · มีสิทธิ์เข้าคอร์สนี้หรือไม่ */
export function hasAccess(ents, course, now) {
  return ents.some((e) => e.expires_at > now && (e.product === 'cefr-all' || e.product === 'cefr-' + course));
}

/** สิทธิ์เรียนของผู้ใช้ที่ล็อกอินแล้ว ณ ตำแหน่งปัจจุบันของคอร์ส (pointer = {week, done})
 * paid   = ซื้อแล้ว ทำได้ทุกอย่าง
 * trial  = ยังไม่ซื้อ อยู่ในสัปดาห์ฟรี: เซสชันเต็ม/สั้น และชุดย่อยของสัปดาห์นั้นทำได้ · ชุดวัดผลทำไม่ได้
 * review = สัปดาห์ฟรีจบแล้วหรือสิทธิ์หมดอายุ: ทบทวนข้อที่เคยเรียน (เซสชันสั้น) ได้ต่อ เนื้อหาใหม่ล็อก → จอขาย
 * left   = จำนวนสัปดาห์ฟรีที่เหลือรวมสัปดาห์ปัจจุบัน (เฉพาะ trial) */
export function studyAccess(ents, course, now, pointer, rules = RULES) {
  if (hasAccess(ents, course, now)) return { level: 'paid', full: true, short: true, checkpoint: true };
  const free = Math.max(0, rules.free_weeks ?? 0);
  const week = pointer?.week ?? 1;
  if (!pointer?.done && week <= free) return { level: 'trial', full: true, short: true, checkpoint: false, left: free - week + 1 };
  return { level: 'review', full: false, short: true, checkpoint: false };
}

/** ตรวจว่าซื้อสินค้านี้ได้หรือไม่ · target = รหัสสินค้าที่จะต่อเวลา (เฉพาะ cefr-extend) */
export function canBuy(ents, product, target, now, rules = RULES) {
  const P = PRODUCTS[product];
  if (!P) return { ok: false, error: 'bad_product' };
  if (P.kind !== 'extend') return { ok: true };
  const T = PRODUCTS[target];
  if (!T || T.kind === 'extend') return { ok: false, error: 'bad_target' };
  const cur = ents.find((e) => e.product === target);
  if (!cur) return { ok: false, error: 'no_entitlement' };
  if (cur.expires_at < now - rules.extend_grace_days * DAY) return { ok: false, error: 'expired_too_long' };
  return { ok: true };
}

/** สิทธิ์หลังเครดิตคำสั่งซื้อ: บวกเวลาต่อจากวันหมดอายุเดิมถ้ายังไม่หมด · คืน {product, expires_at} ที่ต้อง upsert */
export function applyPurchase(ents, product, target, now) {
  const P = PRODUCTS[product];
  const key = P.kind === 'extend' ? target : product;
  const cur = ents.find((e) => e.product === key);
  const base = cur && cur.expires_at > now ? cur.expires_at : now;
  return { product: key, expires_at: base + P.days * DAY };
}

/** คืนเงินได้หรือไม่ (เซิร์ฟเวอร์รายงานสถานะ บอสเป็นผู้โอนคืนและกดเพิกถอนสิทธิ์) */
export function refundEligible(order, fullSessionsSincePaid, now, rules = RULES) {
  if (!order.paid_at || order.refunded_at) return false;
  if (PRODUCTS[order.product]?.kind === 'extend') return false;
  return now - order.paid_at <= rules.refund_days * DAY && fullSessionsSincePaid <= rules.refund_max_sessions;
}

/** ข้อรับรองความคุ้มค่า: ต่อเวลาฟรีครั้งเดียวต่อสิทธิ์ · คืน null ถ้าเคยใช้แล้ว */
export function applyGuarantee(ent, now, rules = RULES) {
  if (ent.guarantee_at) return null;
  const base = ent.expires_at > now ? ent.expires_at : now;
  return { ...ent, expires_at: base + rules.guarantee_days * DAY, guarantee_at: now };
}

// ---------- การตั้งค่าที่เจ้าของแก้ได้จาก owner panel (เก็บในตาราง exam_settings) ----------
// คีย์ที่อนุญาต: free_weeks (0–2) · prices {สินค้า:{baht,launch}} · launch_until (ISO date หรือ null) · on_sale {สินค้า:boolean} · banner {text, until} · maintenance boolean
export const SETTING_KEYS = ['prices', 'launch_until', 'on_sale', 'banner', 'maintenance', 'free_weeks'];
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** ตรวจค่าก่อนบันทึก (เซิร์ฟเวอร์เรียกทุกครั้ง) */
export function validSetting(key, value) {
  if (!SETTING_KEYS.includes(key)) return { ok: false, error: 'bad_key' };
  if (key === 'maintenance') return typeof value === 'boolean' ? { ok: true } : { ok: false, error: 'bad_value' };
  if (key === 'free_weeks') return Number.isInteger(value) && value >= 0 && value <= 2 ? { ok: true } : { ok: false, error: 'bad_value' };
  if (key === 'launch_until') return value === null || isDate(value) ? { ok: true } : { ok: false, error: 'bad_date' };
  if (key === 'on_sale') return value && typeof value === 'object' && Object.entries(value).every(([k, v]) => PRODUCTS[k] && typeof v === 'boolean') ? { ok: true } : { ok: false, error: 'bad_value' };
  if (key === 'banner') return value === null || (typeof value === 'object' && typeof value.text === 'string' && value.text.length <= 200 && (value.until == null || isDate(value.until))) ? { ok: true } : { ok: false, error: 'bad_value' };
  if (key === 'prices') {
    if (!value || typeof value !== 'object') return { ok: false, error: 'bad_value' };
    for (const [k, v] of Object.entries(value)) {
      if (!PRODUCTS[k]) return { ok: false, error: 'bad_product' };
      const ok = v && Number.isInteger(v.baht) && Number.isInteger(v.launch) && v.baht >= 20 && v.baht <= 5000 && v.launch >= 20 && v.launch <= v.baht;   // Beam มีขั้นต่ำ และกันพิมพ์ผิดหลัก
      if (!ok) return { ok: false, error: 'bad_price' };
    }
    return { ok: true };
  }
  return { ok: false, error: 'bad_key' };
}

/** รวมค่าตั้งต้นในโค้ดกับค่าที่เจ้าของตั้ง → รายการสินค้าและกติกาที่ใช้จริง · settings = {key: value} */
export function catalog(settings = {}) {
  const products = {};
  for (const [k, P] of Object.entries(PRODUCTS)) {
    const o = settings.prices?.[k];
    products[k] = { ...P, ...(o ? { baht: o.baht, launch: o.launch } : {}) };
  }
  const rules = { ...RULES, launch_until: settings.launch_until === undefined ? RULES.launch_until : settings.launch_until, free_weeks: Number.isInteger(settings.free_weeks) ? settings.free_weeks : RULES.free_weeks };
  const onSale = (p) => !!products[p] && settings.maintenance !== true && settings.on_sale?.[p] !== false;
  return { products, rules, onSale };
}

/** เจ้าของหรือไม่: อีเมลยืนยันแล้ว และอยู่ในรายการ (รายการมาจาก secret EXAM_OWNER_EMAILS คั่นด้วยจุลภาค ไม่อยู่ใน repo) */
export function isOwner(user, ownerList) {
  if (!user || !user.email || !user.email_confirmed_at) return false;
  const list = String(ownerList ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(user.email).toLowerCase());
}
