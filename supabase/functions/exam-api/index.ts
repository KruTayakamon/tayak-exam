// CEFR for Kru · ตัวจ่ายบทเรียน ตรวจคำตอบ และบันทึกความคืบหน้า · Supabase Edge Function (Deno)
// ร่าง 16 พ.ย. 2569 · **ยังไม่ได้ deploy และยังไม่ได้รันจริง** (เครื่องพัฒนาไม่มี Deno) · ตรรกะทั้งหมดมาจาก _shared/ ซึ่งมีเทสต์ใน Node แล้ว
// สเปก: docs/cefr/03_learning_engine.md ข้อ 6 และ docs/cefr/05_backend.md
// POST {action, ...}:
//   placement_grade {answers:{id:choice}}                 ไม่ต้องล็อกอิน · ตรวจที่เซิร์ฟเวอร์ ไม่ส่งเฉลยกลับ
//   report {item_id, why, note?}                          ไม่ต้องล็อกอิน
//   enrol {course, pace, target_date?, slot?}             ต้องมีสิทธิ์
//   home {course}                                         สถานะวันนี้
//   session {course, kind:'full'|'short'}                 ประกอบเซสชัน พร้อมเฉลย (ผู้มีสิทธิ์)
//   sync {course, events:[{eid,item,q?,answer,mode,ts}], completed?:{kind,minutes}}   เซิร์ฟเวอร์ตรวจคำตอบเอง ไม่เชื่อ correct จากเครื่อง
//   checkpoint_start {course, n} · checkpoint_submit {course, n, answers}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import cfg from "../_shared/config.mjs";
import { dayNo, placementEstimate, projectFinish, readiness, srsUpdate, weekProgress, guaranteeEligible } from "../_shared/engine.mjs";
import { advancePointer, buildSession, remainingSessions } from "../_shared/assemble.mjs";
import { applyGuarantee, hasAccess } from "../_shared/pricing.mjs";

const SITE = Deno.env.get("EXAM_SITE_URL") ?? "http://localhost:8788";
const CORS = { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const EXAM = "cefr";
// deno-lint-ignore no-explicit-any
type Any = any;

// ---------- การตรวจคำตอบ (ที่เดียวของทั้งระบบ) ----------
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function near(a: string, b: string) {                      // สะกดผิดได้ 1 ตัวเมื่อคำยาว ≥ 4
  if (a === b) return true;
  if (b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
/** body = ข้อจาก exam_items.body · q = ลำดับคำถามย่อย · answer = สิ่งที่ผู้เรียนตอบ */
function grade(body: Any, q: number, answer: unknown): boolean {
  if (body.kind === "mcq") return Number(answer) === body.answer;
  if (body.kind === "type") return (body.accept ?? [body.answer]).some((x: string) => near(norm(answer), norm(x)));
  if (body.kind === "order") return Array.isArray(answer) && answer.map(norm).join("|") === body.chunks.map(norm).join("|");
  const qq = body.questions?.[q];
  return !!qq && Number(answer) === qq.answer;
}
/** ตัดเฉลยและเหตุผลออก (แบบวัดระดับและชุดวัดผลก่อนส่ง) */
function strip(body: Any) {
  const cut = (c: Any[]) => c.map((x) => ({ t: x.t }));
  const o: Any = { id: body.id, kind: body.kind, skill: body.skill, stem: body.stem, title: body.title, text: body.text, passage: body.passage, script: body.script };
  if (body.choices) o.choices = cut(body.choices);
  if (body.questions) o.questions = body.questions.map((x: Any) => ({ stem: x.stem, choices: cut(x.choices) }));
  if (body.kind === "order") o.chunks = [...body.chunks].sort(() => Math.random() - 0.5);
  return o;
}

async function userOf(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  return user ?? null;
}
async function entsOf(admin: SupabaseClient, uid: string) {
  const { data } = await admin.from("exam_entitlements").select("product,expires_at,guarantee_at").eq("user_id", uid);
  return (data ?? []).map((e) => ({ ...e, expires_at: new Date(e.expires_at).getTime(), guarantee_at: e.guarantee_at ? new Date(e.guarantee_at).getTime() : null }));
}
async function statesOf(admin: SupabaseClient, uid: string, course: string) {
  const { data } = await admin.from("exam_item_state").select("*").eq("user_id", uid).eq("course", course);
  const m: Record<string, Any> = {};
  for (const r of data ?? []) m[r.item_id] = r;
  return m;
}
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? ""), now = Date.now(), today = dayNo(now, cfg);

    // ---------- ไม่ต้องล็อกอิน ----------
    if (action === "placement_grade") {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
      const ipHash = await sha(ip + (Deno.env.get("EXAM_IP_SALT") ?? ""));
      const { count } = await admin.from("exam_placements").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", new Date(now - 3600e3).toISOString());
      if ((count ?? 0) >= 5) return json({ error: "rate_limited" }, 429);
      const { data: items } = await admin.from("exam_items").select("id,skill,topic,body").eq("exam", EXAM).eq("role", "placement").eq("status", "approved");
      const answers = body.answers ?? {};
      const scores: Record<string, number[]> = { a2: [0, 0], b1: [0, 0], b2: [0, 0], c1: [0, 0] };
      const bySkill: Record<string, number[]> = {};
      for (const it of items ?? []) {
        const band = String(it.body.band ?? "").toLowerCase();          // ข้อของแบบวัดระดับต้องมี band ใน body
        const qs = it.body.questions ? it.body.questions.length : 1;
        for (let q = 0; q < qs; q++) {
          const ok = grade(it.body, q, answers[qs > 1 ? `${it.id}:${q}` : it.id]);
          if (scores[band]) { scores[band][1]++; if (ok) scores[band][0]++; }
          (bySkill[it.skill] ??= [0, 0])[1]++; if (ok) bySkill[it.skill][0]++;
        }
      }
      const result = { ...placementEstimate(scores, cfg), scores, by_skill: bySkill };
      const user = await userOf(admin, req);
      const { data: row } = await admin.from("exam_placements").insert({ user_id: user?.id ?? null, answers, result, ip_hash: ipHash }).select("id").single();
      return json({ id: row?.id, result });
    }
    if (action === "report") {
      const why = String(body.why ?? "other");
      const user = await userOf(admin, req);
      const { error } = await admin.from("exam_reports").insert({ item_id: String(body.item_id ?? "").slice(0, 60), user_id: user?.id ?? null, why, note: body.note ? String(body.note).slice(0, 500) : null });
      return json({ ok: !error });
    }

    // ---------- ต้องล็อกอินและมีสิทธิ์ ----------
    const user = await userOf(admin, req);
    if (!user) return json({ error: "no_session" }, 401);
    const course = String(body.course ?? "");
    const ents = await entsOf(admin, user.id);
    if (!hasAccess(ents, course, now)) return json({ error: "no_access" }, 403);
    const uid = user.id;
    const enrolQ = () => admin.from("exam_enrolments").select("*").eq("user_id", uid).eq("exam", EXAM).eq("course", course).maybeSingle();

    if (action === "enrol") {
      const pace = [10, 20, 40].includes(Number(body.pace)) ? Number(body.pace) : 20;
      const { data: cur } = await enrolQ();
      const order = ["abc", "bca", "cab"][parseInt((await sha(uid + course)).slice(0, 6), 16) % 3];   // ลำดับชุดวัดผลหมุนตามผู้ใช้
      const row = { user_id: uid, exam: EXAM, course, pace, target_date: body.target_date ?? null, slot: body.slot ? String(body.slot).slice(0, 30) : null, cp_order: cur?.cp_order ?? order };
      const { error } = await admin.from("exam_enrolments").upsert(row, { onConflict: "user_id,exam,course" });
      return json({ ok: !error });
    }

    const { data: en } = await enrolQ();
    if (!en) return json({ error: "not_enrolled" }, 409);
    const pointer = { week: en.week, day: en.day, part: en.part, done: en.done };

    if (action === "home") {
      const { data: sess } = await admin.from("exam_sessions").select("day_no,kind").eq("user_id", uid).eq("course", course).gte("day_no", today - 400);
      const days = [...new Set((sess ?? []).map((s) => s.day_no))];
      const { count: due } = await admin.from("exam_item_state").select("item_id", { count: "exact", head: true }).eq("user_id", uid).eq("course", course).lte("due", today);
      const { data: cps } = await admin.from("exam_checkpoints").select("n,score,submitted_at").eq("user_id", uid).eq("course", course).not("submitted_at", "is", null).order("n");
      const { data: ev } = await admin.from("exam_events").select("item_id,correct").eq("user_id", uid).eq("course", course).eq("first", true).in("mode", ["check", "practice", "mock"]).gte("day_no", today - 14);
      const ids = [...new Set((ev ?? []).map((e) => e.item_id))];
      const { data: its } = ids.length ? await admin.from("exam_items").select("id,skill").in("id", ids) : { data: [] as Any[] };
      const skillOf = Object.fromEntries((its ?? []).map((i: Any) => [i.id, i.skill]));
      const prac: Record<string, { correct: number; n: number }> = {};
      for (const e of ev ?? []) { const k = skillOf[e.item_id]; if (!k) continue; (prac[k] ??= { correct: 0, n: 0 }).n++; if (e.correct) prac[k].correct++; }
      const last = (cps ?? []).at(-1)?.score?.by_skill ?? {};
      const ready: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(prac), ...Object.keys(last)])) ready[k] = readiness(last[k] ?? null, prac[k] ?? { correct: 0, n: 0 }, cfg);
      return json({
        pointer, pace: en.pace, due: due ?? 0, week: weekProgress(days, today, cfg), readiness: ready, checkpoints: cps ?? [],
        finish_day: projectFinish(remainingSessions(pointer), en.pace, today, cfg),
        full_sessions: (sess ?? []).filter((s) => s.kind === "full").length,
        access_until: Math.max(...ents.filter((e) => e.product === "cefr-all" || e.product === "cefr-" + course).map((e) => e.expires_at)),
      });
    }

    if (action === "session") {
      const kind = body.kind === "short" ? "short" : "full";
      const { count: nToday } = await admin.from("exam_sessions").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("day_no", today);
      if ((nToday ?? 0) >= cfg.caps_per_day.sessions) return json({ error: "daily_cap" }, 429);
      if (pointer.done && kind === "full") return json({ error: "course_done" }, 409);
      const { data: wk } = await admin.from("exam_course_weeks").select("body").eq("exam", EXAM).eq("course", course).eq("week", pointer.week).maybeSingle();
      if (!wk) return json({ error: "content_missing" }, 404);
      const states = await statesOf(admin, uid, course);
      const { data: old } = pointer.week >= 2 ? await admin.from("exam_items").select("id").eq("exam", EXAM).eq("course", course).eq("role", "pool").lt("week", pointer.week).limit(200) : { data: [] as Any[] };
      const plan = buildSession({ kind, pointer, week: wk.body, states, day: today, lastDay: en.last_day, pace: en.pace, oldPool: (old ?? []).map((x: Any) => x.id), cfg });
      const need = new Set<string>();
      for (const s of plan.steps as Any[]) { for (const id of s.ids ?? []) need.add(id); for (const id of s.check ?? []) need.add(id); }
      const { data: items } = need.size ? await admin.from("exam_items").select("id,body").in("id", [...need]) : { data: [] as Any[] };
      // ผู้มีสิทธิ์ได้ข้อพร้อมเฉลยและเหตุผล เพื่อเฉลยทันทีและทนเน็ตหลุด · การกันดูดคลังใช้เพดานต่อวัน
      return json({ plan, items: Object.fromEntries((items ?? []).map((i: Any) => [i.id, i.body])), day: today });
    }

    if (action === "sync") {
      const events: Any[] = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
      const ids = [...new Set(events.map((e) => String(e.item)))];
      const { data: items } = ids.length ? await admin.from("exam_items").select("id,course,body").in("id", ids) : { data: [] as Any[] };
      const byId = Object.fromEntries((items ?? []).map((i: Any) => [i.id, i]));
      const states = await statesOf(admin, uid, course);
      const rows: Any[] = [], touched = new Set<string>();
      const { data: have } = events.length ? await admin.from("exam_events").select("eid").in("eid", events.map((e) => String(e.eid))) : { data: [] as Any[] };
      const seenEid = new Set((have ?? []).map((x: Any) => x.eid));
      // "ตอบครั้งแรก" ตัดสินจากประวัติที่เซิร์ฟเวอร์มี ไม่เชื่อค่าจากเครื่อง · คีย์ = ข้อ:คำถามย่อย
      const { data: prior } = ids.length ? await admin.from("exam_events").select("item_id,q").eq("user_id", uid).in("item_id", ids) : { data: [] as Any[] };
      const answered = new Set((prior ?? []).map((x: Any) => `${x.item_id}:${x.q}`));
      for (const e of events.sort((a, b) => Number(a.ts) - Number(b.ts))) {
        const it = byId[String(e.item)];
        if (!it || it.course !== course || seenEid.has(String(e.eid))) continue;        // รับซ้ำได้ ไม่นับซ้ำ
        seenEid.add(String(e.eid));
        const q = Number(e.q ?? 0), ok = grade(it.body, q, e.answer), key = `${it.id}:${q}`;
        const d = dayNo(Math.min(Number(e.ts) || now, now), cfg);
        rows.push({ eid: String(e.eid), user_id: uid, exam: EXAM, course, item_id: it.id, q, correct: ok, first: !answered.has(key), mode: String(e.mode ?? "practice"), day_no: d });
        answered.add(key);
        // ข้อเดี่ยวเข้าตารางทบทวนตามเวลา · ชุดข้อความ (บทอ่าน บทฟัง ช่องว่าง) ไม่วนซ้ำรายข้อ: เซิร์ฟเวอร์จัดชุดอื่นของหัวข้อเดียวกันแทน (03 ข้อ 2)
        if (!it.body.questions) { states[it.id] = srsUpdate(states[it.id] ?? null, ok, d, cfg); touched.add(it.id); }
      }
      if (rows.length) await admin.from("exam_events").insert(rows);
      if (touched.size) await admin.from("exam_item_state").upsert([...touched].map((id) => {
        const s = states[id]; return { user_id: uid, item_id: id, course, box: s.box, probe: s.probe, due: s.due, seen: s.seen, wrong: s.wrong, lapses: s.lapses, last: s.last, mastered: s.mastered };
      }), { onConflict: "user_id,item_id" });
      let next = pointer;
      if (body.completed) {
        const kind = ["full", "short", "extra", "remedial", "mock"].includes(body.completed.kind) ? body.completed.kind : "short";
        await admin.from("exam_sessions").insert({ user_id: uid, exam: EXAM, course, kind, week: pointer.week, day: pointer.day, part: pointer.part, day_no: today, minutes: Math.min(Number(body.completed.minutes) || 0, 120), score: body.completed.score ?? null });
        if (kind === "full" || kind === "mock") next = advancePointer(pointer, en.pace);
        await admin.from("exam_enrolments").update({ week: next.week, day: next.day, part: next.part, done: next.done, last_day: today }).eq("user_id", uid).eq("exam", EXAM).eq("course", course);
      }
      return json({ accepted: rows.length, pointer: next, graded: rows.map((r) => ({ eid: r.eid, correct: r.correct })) });
    }

    if (action === "checkpoint_start") {
      const n = Number(body.n);
      if (![1, 2, 3].includes(n)) return json({ error: "bad_n" }, 400);
      const { data: cur } = await admin.from("exam_checkpoints").select("item_ids,submitted_at").eq("user_id", uid).eq("exam", EXAM).eq("course", course).eq("n", n).maybeSingle();
      if (cur?.submitted_at) return json({ error: "already_done" }, 409);
      const form = (en.cp_order ?? "abc")[n - 1];
      const { data: items } = await admin.from("exam_items").select("id,body").eq("exam", EXAM).eq("course", course).eq("role", "checkpoint").eq("form", form).order("id");
      if (!items?.length) return json({ error: "content_missing" }, 404);
      if (!cur) await admin.from("exam_checkpoints").insert({ user_id: uid, exam: EXAM, course, n, form, item_ids: items.map((i) => i.id) });
      return json({ n, form, time_min: 40, items: items.map((i) => strip(i.body)) });      // ไม่มีเฉลยจนกว่าจะส่ง
    }
    if (action === "checkpoint_submit") {
      const n = Number(body.n), answers = body.answers ?? {};
      const { data: cp } = await admin.from("exam_checkpoints").select("*").eq("user_id", uid).eq("exam", EXAM).eq("course", course).eq("n", n).maybeSingle();
      if (!cp) return json({ error: "not_started" }, 409);
      if (cp.submitted_at) return json({ error: "already_done" }, 409);
      const { data: items } = await admin.from("exam_items").select("id,skill,body").in("id", cp.item_ids);
      const by: Record<string, { correct: number; n: number }> = {}; let total = 0, max = 0;
      for (const it of items ?? []) {
        const qs = it.body.questions ? it.body.questions.length : 1;
        for (let q = 0; q < qs; q++) {
          const ok = grade(it.body, q, answers[qs > 1 ? `${it.id}:${q}` : it.id]);
          (by[it.skill] ??= { correct: 0, n: 0 }).n++; max++; if (ok) { by[it.skill].correct++; total++; }
        }
      }
      const score = { total, max, pct: max ? Math.round(100 * total / max) : 0, by_skill: by };
      await admin.from("exam_checkpoints").update({ submitted_at: new Date().toISOString(), answers, score }).eq("user_id", uid).eq("exam", EXAM).eq("course", course).eq("n", n);
      let extended = false;
      if (n === 3) {                                                                        // ข้อรับรองความคุ้มค่า: เซิร์ฟเวอร์ต่อเวลาให้เอง
        const { count: full } = await admin.from("exam_sessions").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("course", course).eq("kind", "full");
        const { count: done } = await admin.from("exam_checkpoints").select("n", { count: "exact", head: true }).eq("user_id", uid).eq("course", course).not("submitted_at", "is", null);
        if (guaranteeEligible({ fullSessions: full ?? 0, totalSessions: 60, checkpointsDone: done ?? 0, finalCheckpointPct: score.pct }, cfg)) {
          const ent = ents.find((e) => e.product === "cefr-" + course) ?? ents.find((e) => e.product === "cefr-all");
          const g = ent && applyGuarantee(ent, now);
          if (g) { await admin.from("exam_entitlements").update({ expires_at: new Date(g.expires_at).toISOString(), guarantee_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }).eq("user_id", uid).eq("product", ent.product); extended = true; }
        }
      }
      return json({ score, extended, items: Object.fromEntries((items ?? []).map((i) => [i.id, i.body])) });   // ส่งแล้วจึงได้เฉลยและเหตุผล
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("exam-api", (e as Error).message ?? e);
    return json({ error: "server" }, 500);
  }
});
