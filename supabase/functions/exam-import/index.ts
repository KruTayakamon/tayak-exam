// CEFR for You · นำเนื้อหาเข้าฐานข้อมูล (มติบอส 17 พ.ย. 2569 รอบ 24 "เขียนทั้งหมด 12 สัปดาห์ และลงได้เลย")
// ใช้แทนการวาง SQL ทีละก้อน: Claude ส่งไฟล์ build/import_*.json ตรงจากเครื่องด้วย curl
// ความปลอดภัย: รับเฉพาะเนื้อหาที่ลายนิ้วมือ (sha256 ของ body) อยู่ใน https://cefrforyou.pages.dev/import/manifest.json
//   ไฟล์นั้นเผยแพร่ได้เฉพาะผู้ที่ push ขึ้น main ของ repo นี้ได้ (Cloudflare Pages) · manifest มีแต่ค่าแฮช ไม่มีเนื้อหาหรือเฉลย
// ทำได้แค่ upsert ข้อ (exam_items) และผังสัปดาห์ (exam_course_weeks) ของสาย cefr · ไม่ลบอะไร · บันทึกใน exam_admin_log
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("EXAM_SITE_URL") ?? "https://cefrforyou.pages.dev";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const ST = ["draft", "approved", "retired"];
// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 2_000_000) return json({ error: "too_large" }, 413);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const man = await fetch(`${SITE}/import/manifest.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!man || !Array.isArray(man.sha256) || !man.sha256.includes(hash)) return json({ error: "not_in_manifest", hash }, 403);
    const p = JSON.parse(raw);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const items = (p.items ?? []).filter((r: Any) => /^cefr-[a-z0-9]+-w\d{2}-\d{3}$/.test(r.id) && ST.includes(r.status));
    const weeks = (p.weeks ?? []).filter((w: Any) => w.exam === "cefr" && /^[a-z0-9]+$/.test(w.course) && Number.isInteger(w.week) && ST.includes(w.status));
    if (items.length) {
      const { error } = await admin.from("exam_items").upsert(items.map((r: Any) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "id" });
      if (error) return json({ error: "items", detail: error.message }, 500);
    }
    if (weeks.length) {
      const { error } = await admin.from("exam_course_weeks").upsert(weeks.map((w: Any) => ({ ...w, updated_at: new Date().toISOString() })), { onConflict: "exam,course,week" });
      if (error) return json({ error: "weeks", detail: error.message }, 500);
    }
    await admin.from("exam_admin_log").insert({ actor: "import", action: "import", detail: { hash, items: items.length, weeks: weeks.map((w: Any) => `${w.course}-${w.week}:${w.status}`) } });
    return json({ ok: true, items: items.length, weeks: weeks.length });
  } catch (e) {
    console.error("exam-import", (e as Error).message ?? e);
    return json({ error: "server" }, 500);
  }
});
