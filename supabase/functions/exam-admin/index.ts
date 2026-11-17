// CEFR for You · owner panel · Supabase Edge Function (Deno)
// ร่าง 16 พ.ย. 2569 · **ยังไม่ได้ deploy และยังไม่ได้รันจริง** · สเปก: docs/cefr/06_owner_panel.md
// ทุกคำขอ: ต้องล็อกอิน + อีเมลยืนยันแล้ว + อยู่ใน secret EXAM_OWNER_EMAILS (บอสตั้งเอง ไม่อยู่ใน repo) มิฉะนั้นได้ 403 ไม่มีข้อยกเว้น
// ทุกการกระทำที่เปลี่ยนข้อมูลถูกบันทึกใน exam_admin_log (ใคร ทำอะไร เมื่อไร)
// POST {action, ...}: overview · orders · order_verify · grant · revoke · refund_mark · settings_get · settings_set
//   content_list · content_status · week_status · reports · report_close · item_stats · learner · learner_delete · log
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { beam, isPaid } from "../exam-billing/beam.ts";
import { applyPurchase, catalog, isOwner, PRODUCTS, SETTING_KEYS, validSetting } from "../_shared/pricing.mjs";

const SITE = Deno.env.get("EXAM_SITE_URL") ?? "http://localhost:8788";
const CORS = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const DAY = 86400000;
// deno-lint-ignore no-explicit-any
type Any = any;

const uidOf = async (admin: SupabaseClient, email: unknown) => {
  const { data } = await admin.rpc("exam_admin_user_id", { p_email: String(email ?? "").trim() });
  return (data as string | null) ?? null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!isOwner(user, Deno.env.get("EXAM_OWNER_EMAILS"))) return json({ error: "forbidden" }, 403);
    const actor = String(user!.email).toLowerCase();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? ""), now = Date.now();
    const log = (act: string, detail: unknown) => admin.from("exam_admin_log").insert({ actor, action: act, detail });

    if (action === "overview") {
      const since = new Date(now - 30 * DAY).toISOString(), d7 = now - 7 * DAY, d1 = now - DAY;
      const { data: paid } = await admin.from("exam_orders").select("amount,product,paid_at").eq("status", "paid").gte("paid_at", since).limit(5000);
      const sum = (from: number) => (paid ?? []).filter((o) => new Date(o.paid_at).getTime() >= from).reduce((a, o) => a + o.amount, 0);
      const count = async (t: string, f?: (q: Any) => Any) => { let q: Any = admin.from(t).select("*", { count: "exact", head: true }); if (f) q = f(q); return (await q).count ?? 0; };
      const { data: act } = await admin.from("exam_sessions").select("user_id").gte("completed_at", new Date(d7).toISOString()).limit(20000);
      return json({
        revenue: { day: sum(d1), week: sum(d7), month: sum(now - 30 * DAY) }, orders_month: (paid ?? []).length,
        by_product: Object.fromEntries(Object.keys(PRODUCTS).map((p) => [p, (paid ?? []).filter((o) => o.product === p).length])),
        funnel_30d: { placements: await count("exam_placements", (q) => q.gte("created_at", since)), enrolments: await count("exam_enrolments", (q) => q.gte("started_at", since)), paid_orders: (paid ?? []).length },
        active_learners_7d: new Set((act ?? []).map((x) => x.user_id)).size,
        pending_orders: await count("exam_orders", (q) => q.eq("status", "pending")),
        open_reports: await count("exam_reports", (q) => q.is("resolved_at", null)),
        draft_items: await count("exam_items", (q) => q.eq("status", "draft")), approved_items: await count("exam_items", (q) => q.eq("status", "approved")),
      });
    }

    if (action === "orders") {
      let q = admin.from("exam_orders").select("*").order("created_at", { ascending: false }).limit(100);
      if (body.status) q = q.eq("status", String(body.status));
      if (body.email) { const id = await uidOf(admin, body.email); if (!id) return json({ orders: [] }); q = q.eq("user_id", id); }
      const { data } = await q; return json({ orders: data ?? [] });
    }
    if (action === "order_verify") {                       // ผู้ซื้อแจ้งว่าจ่ายแล้วแต่ยังไม่ได้สิทธิ์: ถาม Beam แล้วให้สิทธิ์ (กันซ้ำด้วย credited_at)
      const { data: o } = await admin.from("exam_orders").select("*").eq("id", String(body.order)).maybeSingle();
      const b = beam();
      if (!o || !b || !o.provider_link_id) return json({ error: "not_found" }, 404);
      const info = await b.getLink(o.provider_link_id).catch(() => null);
      if (!info || !isPaid(info)) return json({ paid: false });
      const { data: claimed } = await admin.from("exam_orders").update({ status: "paid", paid_at: new Date().toISOString(), credited_at: new Date().toISOString() }).eq("id", o.id).is("credited_at", null).select("id").maybeSingle();
      if (claimed) {
        const { data: ents } = await admin.from("exam_entitlements").select("product,expires_at").eq("user_id", o.user_id);
        const next = applyPurchase((ents ?? []).map((e) => ({ ...e, expires_at: new Date(e.expires_at).getTime() })), o.product, o.target, now);
        await admin.from("exam_entitlements").upsert({ user_id: o.user_id, product: next.product, expires_at: new Date(next.expires_at).toISOString(), source: "order", updated_at: new Date().toISOString() }, { onConflict: "user_id,product" });
        await log("order_verify", { order: o.id });
      }
      return json({ paid: true, credited: !!claimed });
    }
    if (action === "grant" || action === "revoke") {       // ให้สิทธิ์ฟรี/ต่อเวลา หรือเพิกถอนสิทธิ์
      const id = await uidOf(admin, body.email), product = String(body.product ?? "");
      if (!id) return json({ error: "no_user" }, 404);
      if (!PRODUCTS[product as keyof typeof PRODUCTS] || product === "cefr-extend") return json({ error: "bad_product" }, 400);
      if (action === "revoke") {
        await admin.from("exam_entitlements").delete().eq("user_id", id).eq("product", product);
      } else {
        const days = Math.min(Math.max(Math.floor(Number(body.days) || 0), 1), 730);
        const { data: cur } = await admin.from("exam_entitlements").select("expires_at").eq("user_id", id).eq("product", product).maybeSingle();
        const base = cur && new Date(cur.expires_at).getTime() > now ? new Date(cur.expires_at).getTime() : now;
        await admin.from("exam_entitlements").upsert({ user_id: id, product, expires_at: new Date(base + days * DAY).toISOString(), source: "comp", updated_at: new Date().toISOString() }, { onConflict: "user_id,product" });
      }
      await log(action, { email: String(body.email).toLowerCase(), product, days: body.days ?? null, note: body.note ? String(body.note).slice(0, 200) : null });
      return json({ ok: true });
    }
    if (action === "refund_mark") {                        // หลังบอสโอนเงินคืนเองแล้ว: บันทึกและเพิกถอนสิทธิ์ของคำสั่งซื้อนั้น
      const { data: o } = await admin.from("exam_orders").select("*").eq("id", String(body.order)).maybeSingle();
      if (!o || o.status !== "paid") return json({ error: "not_paid" }, 409);
      await admin.from("exam_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", o.id);
      await admin.from("exam_entitlements").delete().eq("user_id", o.user_id).eq("product", o.target ?? o.product);
      await log("refund_mark", { order: o.id, amount: o.amount });
      return json({ ok: true });
    }

    if (action === "settings_get") {
      const { data } = await admin.from("exam_settings").select("key,value,updated_by,updated_at");
      const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      const c = catalog(s);
      return json({ settings: s, meta: data ?? [], effective: Object.fromEntries(Object.entries(c.products).map(([k, p]: [string, Any]) => [k, { baht: p.baht, launch: p.launch, days: p.days, on_sale: c.onSale(k) }])), launch_until: c.rules.launch_until, keys: SETTING_KEYS });
    }
    if (action === "settings_set") {
      const key = String(body.key ?? ""), v = validSetting(key, body.value);
      if (!v.ok) return json({ error: v.error }, 400);
      const { data: old } = await admin.from("exam_settings").select("value").eq("key", key).maybeSingle();
      await admin.from("exam_settings").upsert({ key, value: body.value, updated_by: actor, updated_at: new Date().toISOString() });
      await log("settings_set", { key, from: old?.value ?? null, to: body.value });
      return json({ ok: true });
    }

    if (action === "content_list") {
      let q = admin.from("exam_items").select("id,course,week,kind,skill,topic,level,role,status,version,body").eq("exam", "cefr").order("id").limit(300);
      if (body.course) q = q.eq("course", String(body.course));
      if (body.week) q = q.eq("week", Number(body.week));
      if (body.status) q = q.eq("status", String(body.status));
      const { data } = await q; return json({ items: data ?? [] });
    }
    if (action === "content_status") {                     // อนุมัติ ส่งกลับเป็นร่าง หรือถอดข้อออกทันที
      const status = String(body.status ?? ""), ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 300);
      if (!["draft", "approved", "retired"].includes(status) || !ids.length) return json({ error: "bad_request" }, 400);
      const { count } = await admin.from("exam_items").update({ status, updated_at: new Date().toISOString() }, { count: "exact" }).in("id", ids);
      await log("content_status", { status, n: count ?? 0, ids: ids.slice(0, 50) });
      return json({ ok: true, changed: count ?? 0 });
    }
    if (action === "week_status") {
      const status = String(body.status ?? "");
      if (!["draft", "approved", "retired"].includes(status)) return json({ error: "bad_request" }, 400);
      await admin.from("exam_course_weeks").update({ status, updated_at: new Date().toISOString() }).eq("exam", "cefr").eq("course", String(body.course)).eq("week", Number(body.week));
      await log("week_status", { course: body.course, week: body.week, status });
      return json({ ok: true });
    }
    if (action === "reports") {
      let q = admin.from("exam_reports").select("*").order("created_at", { ascending: false }).limit(200);
      if (!body.all) q = q.is("resolved_at", null);
      const { data } = await q; return json({ reports: data ?? [] });
    }
    if (action === "report_close") {
      await admin.from("exam_reports").update({ resolved_at: new Date().toISOString(), resolution: body.resolution ? String(body.resolution).slice(0, 200) : null }).eq("id", String(body.id));
      await log("report_close", { id: body.id, resolution: body.resolution ?? null });
      return json({ ok: true });
    }
    if (action === "item_stats") {                         // อัตราถูกครั้งแรกของข้อ (ใช้หาข้อที่ง่าย/ยากผิดปกติ หรือเฉลยอาจผิด)
      const { data: its } = await admin.from("exam_items").select("id").eq("exam", "cefr").eq("course", String(body.course)).eq("week", Number(body.week));
      const ids = (its ?? []).map((x) => x.id);
      const { data: ev } = ids.length ? await admin.from("exam_events").select("item_id,q,correct").eq("first", true).in("item_id", ids).limit(50000) : { data: [] as Any[] };
      const st: Record<string, { n: number; correct: number }> = {};
      for (const e of ev ?? []) { const k = `${e.item_id}:${e.q}`; (st[k] ??= { n: 0, correct: 0 }).n++; if (e.correct) st[k].correct++; }
      return json({ stats: st });
    }

    if (action === "learner") {                            // ดูข้อมูลเท่าที่จำเป็นต่อการช่วยเหลือผู้เรียน
      const id = await uidOf(admin, body.email);
      if (!id) return json({ error: "no_user" }, 404);
      const [en, ents, cps, ord] = await Promise.all([
        admin.from("exam_enrolments").select("*").eq("user_id", id), admin.from("exam_entitlements").select("*").eq("user_id", id),
        admin.from("exam_checkpoints").select("course,n,score,submitted_at").eq("user_id", id), admin.from("exam_orders").select("id,product,amount,status,created_at,paid_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
      ]);
      const { count: full } = await admin.from("exam_sessions").select("id", { count: "exact", head: true }).eq("user_id", id).eq("kind", "full");
      await log("learner_view", { email: String(body.email).toLowerCase() });
      return json({ enrolments: en.data ?? [], entitlements: ents.data ?? [], checkpoints: cps.data ?? [], orders: ord.data ?? [], full_sessions: full ?? 0 });
    }
    if (action === "learner_delete") {                     // ลบข้อมูลการเรียนตามคำขอของเจ้าของข้อมูล · ต้องพิมพ์อีเมลซ้ำเพื่อยืนยัน
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || String(body.confirm ?? "").trim().toLowerCase() !== email) return json({ error: "confirm_mismatch" }, 400);
      const id = await uidOf(admin, email);
      if (!id) return json({ error: "no_user" }, 404);
      const { error } = await admin.rpc("exam_admin_delete_user_data", { p_user: id });
      await log("learner_delete", { email, ok: !error });
      return json({ ok: !error });
    }
    if (action === "log") {
      const { data } = await admin.from("exam_admin_log").select("*").order("created_at", { ascending: false }).limit(200);
      return json({ log: data ?? [] });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("exam-admin", (e as Error).message ?? e);
    return json({ error: "server" }, 500);
  }
});
