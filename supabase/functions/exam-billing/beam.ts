// Beam adapter (คัดลอกจากเกมครัว tayak-cefr/supabase/functions/billing/beam.ts 16 พ.ย. 2569 แล้วปรับรหัสสินค้า) · ไฟล์เดียวที่รู้รูปแบบคำขอของ Beam
// Checked 28 Oct against docs.beamcheckout.com (Authentication + Payment Links API + Integration Guide):
//   POST /api/v1/payment-links  {order:{currency,description,netAmount,referenceId,orderItems[]}, linkSettings, redirectUrl, expiresAt} -> {id, url}
//   GET  /api/v1/payment-links/{id} -> {paymentLinkId, url, status: ACTIVE | PAID | EXPIRED | ...}
//   HTTP Basic auth = merchantId:apiKey · amounts in the smallest currency unit (satang) · hosts: playground.api.beamcheckout.com / api.beamcheckout.com
// Beam responses are still read defensively (several candidate keys) so a naming difference degrades to "not paid yet", never to a wrong credit.
export type BeamClient = {
  createLink(p: { amount: number; referenceId: string; description: string; returnUrl: string; sku: string }): Promise<Record<string, unknown>>;
  getLink(id: string): Promise<Record<string, unknown>>;
};

export function beam(): BeamClient | null {
  const mid = Deno.env.get("BEAM_MERCHANT_ID"), key = Deno.env.get("BEAM_API_KEY");
  if (!mid || !key) return null;
  // BEAM_ENV=playground switches to Beam's test host (playground keys only work there); BEAM_API_BASE overrides both
  const base = (Deno.env.get("BEAM_API_BASE") ?? (Deno.env.get("BEAM_ENV") === "playground" ? "https://playground.api.beamcheckout.com/api/v1" : "https://api.beamcheckout.com/api/v1")).replace(/\/$/, "");
  const minor = (Deno.env.get("BEAM_MINOR_UNITS") ?? "1") !== "0"; // amounts in satang (THB 99 -> 9900), per Beam's Integration Guide
  const auth = "Basic " + btoa(`${mid}:${key}`);
  const cardOn = Deno.env.get("BEAM_ENABLE_CARD") === "1"; // cards need Beam's approval on the merchant account (else 400 "cannot enable CREDIT_CARD"); PromptPay works first
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
    if (!r.ok) throw new Error(`beam ${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
    return j;
  };
  return {
    createLink: (p) => {
      const amt = minor ? p.amount * 100 : p.amount;
      return call("POST", "/payment-links", {
        order: {
          currency: "THB", description: p.description, netAmount: amt, referenceId: p.referenceId,
          orderItems: [{ itemName: p.description, description: p.description, price: amt, quantity: 1, sku: p.sku, productId: "cefr-for-you" }],
        },
        linkSettings: { card: { isEnabled: cardOn }, qrPromptPay: { isEnabled: true }, eWallets: { isEnabled: false }, mobileBanking: { isEnabled: false }, buyNowPayLater: { isEnabled: false }, cardInstallments: { isEnabled: false } },
        collectDeliveryAddress: false,
        redirectUrl: p.returnUrl,
        expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(),
      });
    },
    getLink: (id) => call("GET", `/payment-links/${encodeURIComponent(id)}`),
  };
}

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((a, s) => (a && typeof a === "object" ? (a as Record<string, unknown>)[s] : undefined), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};
export const linkIdOf = (o: Record<string, unknown>) => String(pick(o, ["paymentLinkId", "id", "data.paymentLinkId", "data.id", "paymentLink.paymentLinkId", "paymentLink.id"]) ?? "");
export const linkUrlOf = (o: Record<string, unknown>) => String(pick(o, ["url", "paymentLinkUrl", "link", "checkoutUrl", "data.url", "data.paymentLinkUrl", "paymentLink.url"]) ?? "");
export const sourceIdOf = (o: Record<string, unknown>) => String(pick(o, ["sourceId", "data.sourceId", "charge.sourceId", "data.charge.sourceId"]) ?? "");
export const refIdOf = (o: Record<string, unknown>) => String(pick(o, ["referenceId", "order.referenceId", "data.order.referenceId", "data.referenceId", "paymentLink.referenceId", "charge.referenceId", "data.paymentLink.referenceId"]) ?? "");
/** paid only when Beam says so explicitly: a status/state of PAID|SUCCEEDED|COMPLETED or a boolean paid flag */
export function isPaid(o: Record<string, unknown>): boolean {
  const st = pick(o, ["status", "paymentStatus", "state", "data.status", "paymentLink.status", "charge.status"]);
  if (typeof st === "string" && /^(paid|succeeded|success|completed|complete)$/i.test(st)) return true;
  const flag = pick(o, ["paid", "isPaid", "data.paid"]);
  return flag === true;
}
