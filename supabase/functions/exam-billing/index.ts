// CEFR for You · การชำระเงิน · Supabase Edge Function (Deno) · ผู้ให้บริการ: Beam
// ร่าง 16 พ.ย. 2569 · **ยังไม่ได้ deploy และยังไม่ได้รันจริง** (เครื่องพัฒนาไม่มี Deno) ต้องทดสอบกับ Beam playground ก่อนเปิดขาย
// ราคาและสิทธิ์คำนวณจาก _shared/pricing.mjs เท่านั้น (สำเนาของ engine/pricing.mjs)
// action: status → สิทธิ์ที่มี + ราคาทุกสินค้า · checkout {product, target?} → สร้างคำสั่งซื้อ + ลิงก์จ่าย · verify {order?} → ถาม Beam แล้วให้สิทธิ์
// ไม่พึ่ง webhook (05_site_architecture ข้อ 1.4 ทางเลือก ก.): ให้สิทธิ์เมื่อผู้ซื้อกลับจากหน้าจ่าย และทุกครั้งที่เปิดหน้าบัญชี
// Secrets (บอสตั้งใน Supabase ไม่อยู่ใน repo): BEAM_MERCHANT_ID BEAM_API_KEY EXAM_SITE_URL · ถ้าใช้บัญชี Beam เดียวกับเกมครัว ใช้ค่าเดิมได้
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { beam, isPaid, linkIdOf, linkUrlOf } from "./beam.ts";
import { applyPurchase, canBuy, catalog, quote, refundEligible } from "../_shared/pricing.mjs";

const SITE = Deno.env.get("EXAM_SITE_URL") ?? "http://localhost:8788";
const CORS = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const ms = (t: string | null) => (t ? new Date(t).getTime() : 0);
/** รายการสินค้าและกติกาที่ใช้จริง = ค่าในโค้ด + ค่าที่เจ้าของตั้งใน owner panel (ตาราง exam_settings) */
async function catalogNow(admin: SupabaseClient) {
  const { data } = await admin.from("exam_settings").select("key,value");
  return catalog(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
}

async function entsOf(admin: SupabaseClient, uid: string) {
  const { data } = await admin.from("exam_entitlements").select("product,expires_at,guarantee_at,source").eq("user_id", uid);
  return (data ?? []).map((e) => ({ ...e, expires_at: ms(e.expires_at) }));
}

/** ให้สิทธิ์ของคำสั่งซื้อที่จ่ายแล้ว ครั้งเดียวเท่านั้น (credited_at เป็นตัวกัน) */
async function creditOrder(admin: SupabaseClient, orderId: string): Promise<boolean> {
  const now = new Date();
  const { data: o } = await admin.from("exam_orders").update({ status: "paid", paid_at: now.toISOString(), credited_at: now.toISOString() })
    .eq("id", orderId).is("credited_at", null).select("user_id,product,target").maybeSingle();
  if (!o) return false;
  const next = applyPurchase(await entsOf(admin, o.user_id), o.product, o.target, now.getTime());
  const { error } = await admin.from("exam_entitlements").upsert({ user_id: o.user_id, product: next.product, expires_at: new Date(next.expires_at).toISOString(), source: "order", updated_at: now.toISOString() }, { onConflict: "user_id,product" });
  if (error) { console.error("credit", error.message); return false; }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "no_session" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return json({ error: "bad_session" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? ""), now = Date.now();

    if (action === "status") {
      const ents = await entsOf(admin, user.id);
      const { data: orders } = await admin.from("exam_orders").select("id,product,target,amount,status,created_at,paid_at,refunded_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      const out = [];
      for (const o of orders ?? []) {
        let refundable = false;
        if (o.status === "paid" && o.paid_at) {
          const { count } = await admin.from("exam_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "full").gte("completed_at", o.paid_at);
          refundable = refundEligible({ product: o.product, paid_at: ms(o.paid_at), refunded_at: o.refunded_at }, count ?? 0, now);
        }
        out.push({ ...o, refundable });
      }
      const c = await catalogNow(admin);
      return json({ entitlements: ents, orders: out, prices: Object.keys(c.products).filter((p) => c.onSale(p)).map((p) => quote(p, now, c.rules, c.products)) });
    }

    const b = beam();
    if (!b) return json({ error: "billing_off" }, 503);

    if (action === "checkout") {
      const product = String(body.product ?? ""), target = body.target ? String(body.target) : null;
      const c = await catalogNow(admin);
      if (!c.onSale(product)) return json({ error: "not_on_sale" }, 409);
      const q = quote(product, now, c.rules, c.products);
      if (!q) return json({ error: "bad_product" }, 400);
      const can = canBuy(await entsOf(admin, user.id), product, target, now);
      if (!can.ok) return json({ error: can.error }, 409);
      const { data: order, error: oErr } = await admin.from("exam_orders").insert({ user_id: user.id, product, target, days: q.days, amount: q.amount, list_price: q.list, launch: q.launch }).select("id").single();
      if (oErr || !order) { console.error("order insert", oErr?.message); return json({ error: "db" }, 500); }
      const link = await b.createLink({ amount: q.amount, referenceId: order.id, description: `${q.th} · CEFR for You`, returnUrl: `${SITE}/account/?order=${order.id}`, sku: product });
      const url = linkUrlOf(link);
      if (!url) { console.error("beam link without url", JSON.stringify(link).slice(0, 500)); return json({ error: "provider" }, 502); }
      await admin.from("exam_orders").update({ provider_link_id: linkIdOf(link), provider_url: url }).eq("id", order.id);
      return json({ url, order: order.id, amount: q.amount });
    }

    if (action === "verify") {
      let qy = admin.from("exam_orders").select("id,provider_link_id").eq("user_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(5);
      if (body.order) qy = qy.eq("id", String(body.order));
      const { data: pend } = await qy;
      let credited = 0;
      for (const o of pend ?? []) {
        if (!o.provider_link_id) continue;
        const info = await b.getLink(o.provider_link_id).catch(() => null);   // ไม่เชื่อค่าจากเบราว์เซอร์ ถาม Beam เอง
        if (info && isPaid(info) && await creditOrder(admin, o.id)) credited++;
      }
      return json({ credited, pending: (pend ?? []).length - credited, entitlements: await entsOf(admin, user.id) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("exam-billing", (e as Error).message ?? e);
    return json({ error: "server" }, 500);
  }
});
