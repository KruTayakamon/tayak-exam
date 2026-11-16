// ราคาและสิทธิ์ของ CEFR for Kru · ฟังก์ชันล้วน · เซิร์ฟเวอร์เป็นผู้คำนวณเสมอ หน้าเว็บแสดงผลอย่างเดียว
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
  extend_grace_days: 90,         // ต่อเวลาได้แม้สิทธิ์หมดไปแล้วไม่เกินกี่วัน
};

export const launchOn = (now, rules = RULES) => rules.launch_until == null || now < Date.parse(rules.launch_until);

/** ราคาที่ต้องจ่ายตอนนี้ */
export function quote(product, now, rules = RULES) {
  const P = PRODUCTS[product];
  if (!P) return null;
  const launch = launchOn(now, rules) && P.launch < P.baht;
  return { product, th: P.th, list: P.baht, amount: launch ? P.launch : P.baht, launch, days: P.days };
}

/** ents = [{product, expires_at(ms)}] · มีสิทธิ์เข้าคอร์สนี้หรือไม่ */
export function hasAccess(ents, course, now) {
  return ents.some((e) => e.expires_at > now && (e.product === 'cefr-all' || e.product === 'cefr-' + course));
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
