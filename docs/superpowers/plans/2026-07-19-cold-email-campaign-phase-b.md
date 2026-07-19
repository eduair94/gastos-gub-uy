# Cold-Email Campaign (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a compliant, rubro-personalized cold email to the suppliers enriched in Phase A, promoting the free tender-alert product, via nodemailer→Brevo — with global suppression, a first-party one-click unsubscribe, bounce/complaint auto-suppression from Brevo's webhook, and a `/registro?rubro=` landing that pre-creates a watch.

**Architecture:** A `NodemailerMailer` (SMTP → Brevo) implementing the existing `Mailer` interface; three new collections (`email_suppressions`, `email_campaigns`, `campaign_sends`); a recipient builder that segments Phase A's `supplier_contacts` by rubro and excludes users/suppressed; a Spanish campaign template with List-Unsubscribe + a Ley-18.331 footer + a live "N llamados abiertos en tu rubro" count; a throttled dispatch job with a warmup ramp and a complaint kill-switch; a Brevo webhook + a non-user unsubscribe endpoint that both write suppressions; a `registro?rubro=` landing that pre-creates a watch; and a stats script.

**Tech Stack:** TypeScript (tsx jobs + Nuxt/Nitro server routes), nodemailer, Mongoose, MongoDB. Tests are `node:assert` scripts run with `npx tsx` (no jest/vitest). Server routes are Nitro `defineEventHandler` files under `app/server/api/`.

## Global Constraints

- **SEND is ops-blocked** (build freely, but real sends need these): a verified **subdomain** in Brevo (SPF/DKIM/DMARC), Brevo SMTP creds, the webhook shared secret, and the Phase A coverage run on the 167 server. Until `COLD_SMTP_*` env is set, `NodemailerMailer` MUST be a **no-op** (log + return `{ok:false, skipped:true}`), exactly like `createMailer()` does for Resend today. Never crash a dev run.
- **The cold path never touches Resend.** `src/services/mailer.ts` (`createMailer`) stays transactional-only and unchanged. Cold uses a **separate** transport + creds.
- **Suppression is global and checked before every cold send.** Never send to an email in `email_suppressions`.
- **Exclude existing users** from cold recipients (join `users.email`) — they already have the product.
- Job entrypoints under `src/jobs/campaign/`; models under `shared/models/`; server routes under `app/server/api/campaign/`; tests under `tests/unit/`.
- `autoIndex` is OFF globally — declare indexes in models but BUILD them in `scripts/ensure-indexes.ts`.
- Mongoose registration MUST be HMR-safe: `(mongoose.models.X as Model<I>) || mongoose.model<I>(...)`.
- Reuse Phase A data: `supplier_contacts` (`primaryEmail`, `rubros[]`, `name`, `supplierId`). Reuse `open_calls` (`status:"open"`, `classificationSet:[code]`, `tenderPeriod.endDate`) for the live count, and `sice_catalog` for rubro labels.
- **CRITICAL — shared working tree:** a concurrent owner session is live-editing this repo (including `app/` files, `shared/models/user.ts`, `app/pages/registro.vue`, i18n). Every task stages ONLY its own explicit paths — NEVER `git add -A`/`-u`/`.`. Tasks that must modify an existing app file (registro landing, ensure-indexes) are flagged; do those edits surgically and re-read the file immediately before editing.
- Commit after every task. Conventional Commits, no Co-Authored-By. Branch `feat/supplier-cold-email-campaign`.

---

## File Structure

- `shared/models/email_suppression.ts` — global opt-out/bounce list. (create)
- `shared/models/email_campaign.ts` — a campaign definition. (create)
- `shared/models/campaign_send.ts` — one row per recipient per campaign. (create)
- `scripts/ensure-indexes.ts` — add the three collections' index builds. (modify, surgical)
- `src/services/cold-mailer.ts` — `NodemailerMailer` (SMTP→Brevo), same `Mailer` interface. (create)
- `src/jobs/campaign/suppression.ts` — `isSuppressed` / `suppress` helpers. (create)
- `src/jobs/campaign/recipients.ts` — build + segment the send list from `supplier_contacts`. (create)
- `src/jobs/campaign/open-calls-count.ts` — live count of open calls per rubro (the hook N). (create)
- `src/emails/campaign-templates.ts` — es template (HTML+text), List-Unsubscribe, Ley footer. (create)
- `src/jobs/campaign/enqueue.ts` — materialize `campaign_sends` for a campaign+segment. (create)
- `src/jobs/campaign/send.ts` — throttled dispatch + warmup + kill-switch + suppression gate. (create)
- `app/server/api/campaign/unsubscribe.get.ts` + `.post.ts` — non-user one-click opt-out. (create)
- `app/server/api/campaign/webhook.post.ts` — Brevo events → sends + auto-suppress. (create)
- `app/pages/registro.vue` — accept `?rubro=` → pre-create a watch after signup. (modify, surgical)
- `scripts/campaign-stats.ts` — funnel stats overall + per rubro. (create)
- `tests/unit/test-campaign-*.ts` — assertion tests. (create)

Build order groups: **Foundation (T1–T4, buildable now, no creds)** → **Send (T5–T7)** → **Tracking (T8–T9)** → **Landing + stats (T10–T11)** → **Pilot (T12, ops-gated)**.

---

### Task 1: Suppression + campaign + send models

**Files:**
- Create: `shared/models/email_suppression.ts`, `shared/models/email_campaign.ts`, `shared/models/campaign_send.ts`
- Modify (surgical): `scripts/ensure-indexes.ts`
- Test: `tests/unit/test-campaign-models.ts`

**Interfaces produced:**
- `SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual"`
- `IEmailSuppression = { email: string; reason: SuppressionReason; source: string; at: Date }`
- `ICampaignSend` status: `"queued"|"sent"|"delivered"|"opened"|"clicked"|"bounced"|"complained"|"unsubscribed"|"failed"`
- `IEmailCampaign` status: `"draft"|"sending"|"paused"|"done"`
- Models: `EmailSuppressionModel`, `EmailCampaignModel`, `CampaignSendModel`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/test-campaign-models.ts
import assert from "node:assert";
import { EmailSuppressionModel } from "../../shared/models/email_suppression";
import { EmailCampaignModel } from "../../shared/models/email_campaign";
import { CampaignSendModel } from "../../shared/models/campaign_send";

const sup = new EmailSuppressionModel({ email: "a@b.uy", reason: "unsubscribe", source: "campaign:promo1" });
assert.equal(sup.validateSync(), undefined);
assert.equal(sup.collection.name, "email_suppressions");

const camp = new EmailCampaignModel({ key: "promo1", name: "Promo llamados", subjectTemplate: "{{n}} licitaciones en {{rubro}}" });
assert.equal(camp.validateSync(), undefined);
assert.equal(camp.status, "draft");

const send = new CampaignSendModel({ campaignId: "promo1", supplierId: "R/1", email: "a@b.uy", rubroKey: "28267", token: "tok123" });
assert.equal(send.validateSync(), undefined);
assert.equal(send.status, "queued");
console.log("ok: campaign models");
```

- [ ] **Step 2: Run — expect FAIL** (`npx tsx tests/unit/test-campaign-models.ts` → module not found).

- [ ] **Step 3: Write the three models**

```ts
// shared/models/email_suppression.ts
import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";
export interface IEmailSuppression { email: string; reason: SuppressionReason; source: string; at: Date }
const S = new Schema<IEmailSuppression>({
  email: { type: String, required: true, lowercase: true, trim: true },
  reason: { type: String, required: true },
  source: { type: String, default: "" },
  at: { type: Date, default: Date.now },
}, { collection: "email_suppressions" });
S.index({ email: 1 }, { unique: true });
export const EmailSuppressionModel: Model<IEmailSuppression> =
  (mongoose.models.EmailSuppression as Model<IEmailSuppression>) || mongoose.model<IEmailSuppression>("EmailSuppression", S);
```

```ts
// shared/models/email_campaign.ts
import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
export type CampaignStatus = "draft" | "sending" | "paused" | "done";
export interface IEmailCampaign {
  key: string; name: string; subjectTemplate: string;
  status: CampaignStatus; segmentRubros?: string[]; createdAt?: Date; updatedAt?: Date;
}
const S = new Schema<IEmailCampaign>({
  key: { type: String, required: true },
  name: { type: String, required: true },
  subjectTemplate: { type: String, required: true },
  status: { type: String, default: "draft" },
  segmentRubros: { type: [String], default: undefined },
}, { timestamps: true, collection: "email_campaigns" });
S.index({ key: 1 }, { unique: true });
export const EmailCampaignModel: Model<IEmailCampaign> =
  (mongoose.models.EmailCampaign as Model<IEmailCampaign>) || mongoose.model<IEmailCampaign>("EmailCampaign", S);
```

```ts
// shared/models/campaign_send.ts
import { Schema } from "mongoose"; import type { Model } from "mongoose";
import { mongoose } from "../connection/database";
export type SendStatus = "queued"|"sent"|"delivered"|"opened"|"clicked"|"bounced"|"complained"|"unsubscribed"|"failed";
export interface ICampaignSend {
  campaignId: string; supplierId: string; email: string; rubroKey: string; token: string;
  status: SendStatus; providerMessageId?: string; error?: string;
  queuedAt?: Date; sentAt?: Date; updatedAt?: Date;
}
const S = new Schema<ICampaignSend>({
  campaignId: { type: String, required: true },
  supplierId: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  rubroKey: { type: String, default: "" },
  token: { type: String, required: true },
  status: { type: String, default: "queued" },
  providerMessageId: { type: String },
  error: { type: String },
  queuedAt: { type: Date, default: Date.now },
  sentAt: { type: Date },
}, { timestamps: true, collection: "campaign_sends" });
S.index({ campaignId: 1, email: 1 }, { unique: true });
S.index({ token: 1 }, { unique: true });
S.index({ status: 1, campaignId: 1 });
S.index({ providerMessageId: 1 });
export const CampaignSendModel: Model<ICampaignSend> =
  (mongoose.models.CampaignSend as Model<ICampaignSend>) || mongoose.model<ICampaignSend>("CampaignSend", S);
```

- [ ] **Step 4: Run — expect PASS** (`ok: campaign models`).

- [ ] **Step 5: Add index builds to `ensure-indexes.ts`** — surgically, mirroring the Phase A `supplier_contacts` block already there:

```ts
// --- campaign collections (Phase B) ---
const sup = db.collection('email_suppressions')
await sup.createIndex({ email: 1 }, { unique: true, background: true, name: 'email_1' })
const camp = db.collection('email_campaigns')
await camp.createIndex({ key: 1 }, { unique: true, background: true, name: 'key_1' })
const csend = db.collection('campaign_sends')
await csend.createIndex({ campaignId: 1, email: 1 }, { unique: true, background: true, name: 'campaignId_1_email_1' })
await csend.createIndex({ token: 1 }, { unique: true, background: true, name: 'token_1' })
await csend.createIndex({ status: 1, campaignId: 1 }, { background: true, name: 'status_1_campaignId_1' })
await csend.createIndex({ providerMessageId: 1 }, { background: true, name: 'providerMessageId_1' })
console.log('✅ campaign collections indexes ensured')
```

- [ ] **Step 6: Commit** — `git add shared/models/email_suppression.ts shared/models/email_campaign.ts shared/models/campaign_send.ts scripts/ensure-indexes.ts tests/unit/test-campaign-models.ts` → `feat(campaign): suppression/campaign/send models + indexes`.

---

### Task 2: Suppression helpers

**Files:** Create `src/jobs/campaign/suppression.ts`; Test `tests/unit/test-campaign-suppression.ts`

**Interfaces produced:**
- `isSuppressed(email: string): Promise<boolean>`
- `suppress(email: string, reason: SuppressionReason, source: string): Promise<void>` (idempotent upsert)

- [ ] **Step 1: Failing test** (inject a fake model surface so no DB):

```ts
// tests/unit/test-campaign-suppression.ts
import assert from "node:assert";
import { normalizeSuppressEmail } from "../../src/jobs/campaign/suppression";
assert.equal(normalizeSuppressEmail("  A@B.UY "), "a@b.uy");
assert.equal(normalizeSuppressEmail("bad"), null);
console.log("ok: campaign suppression");
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/jobs/campaign/suppression.ts
import { EmailSuppressionModel } from "../../../shared/models/email_suppression";
import type { SuppressionReason } from "../../../shared/models/email_suppression";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export function normalizeSuppressEmail(raw: string): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}
export async function isSuppressed(email: string): Promise<boolean> {
  const e = normalizeSuppressEmail(email); if (!e) return true; // unusable = treat as suppressed
  return !!(await EmailSuppressionModel.exists({ email: e }));
}
export async function suppress(email: string, reason: SuppressionReason, source: string): Promise<void> {
  const e = normalizeSuppressEmail(email); if (!e) return;
  await EmailSuppressionModel.updateOne({ email: e }, { $setOnInsert: { email: e, reason, source, at: new Date() } }, { upsert: true });
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(campaign): suppression helpers`).

---

### Task 3: NodemailerMailer (SMTP → Brevo)

**Files:** Create `src/services/cold-mailer.ts`; Test `tests/unit/test-cold-mailer.ts`. Add `nodemailer` + `@types/nodemailer` to deps.

**Interfaces produced:** `createColdMailer(): Mailer` — reuses `Mailer`/`MailMessage`/`MailResult` from `src/services/mailer.ts`. No-op (skipped) when `COLD_SMTP_*` unset.

- [ ] **Step 1: Failing test** (inject a fake transport so no network):

```ts
// tests/unit/test-cold-mailer.ts
import assert from "node:assert";
import { ColdMailer } from "../../src/services/cold-mailer";

(async () => {
  const sent: any[] = [];
  const fakeTransport = { sendMail: async (m: any) => { sent.push(m); return { messageId: "<abc@brevo>" }; } };
  const m = new ColdMailer(fakeTransport as any, "novedades@info.gastos-gub.uy");
  const res = await m.send({ to: "x@y.uy", subject: "hi", html: "<p>h</p>", text: "h", headers: { "List-Unsubscribe": "<https://u>" } });
  assert.equal(res.ok, true);
  assert.equal(res.id, "<abc@brevo>");
  assert.equal(sent[0].from, "novedades@info.gastos-gub.uy");
  assert.equal(sent[0].headers["List-Unsubscribe"], "<https://u>");
  console.log("ok: cold mailer");
})();
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/services/cold-mailer.ts
import nodemailer from "nodemailer";
import type { Mailer, MailMessage, MailResult } from "./mailer";

export class ColdMailer implements Mailer {
  constructor(private transport: nodemailer.Transporter, private from: string, private replyTo?: string) {}
  async send(msg: MailMessage): Promise<MailResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
      });
      return { ok: true, id: info.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
class NoopColdMailer implements Mailer {
  async send(msg: MailMessage): Promise<MailResult> {
    console.warn(`[cold-mailer] COLD_SMTP_* not set — skipping cold email to ${msg.to}: "${msg.subject}"`);
    return { ok: false, skipped: true };
  }
}
let cached: Mailer | null = null;
export function createColdMailer(): Mailer {
  if (cached) return cached;
  const host = process.env.COLD_SMTP_HOST, user = process.env.COLD_SMTP_USER, pass = process.env.COLD_SMTP_PASS;
  const from = process.env.COLD_SMTP_FROM, replyTo = process.env.COLD_SMTP_REPLY_TO || undefined;
  const port = Number(process.env.COLD_SMTP_PORT ?? "587");
  if (!host || !user || !pass || !from) { cached = new NoopColdMailer(); return cached; }
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  cached = new ColdMailer(transport, from, replyTo);
  return cached;
}
```

- [ ] **Step 4: Install deps** — `npm i nodemailer && npm i -D @types/nodemailer` (root package.json). **Step 5: Run — expect PASS.** **Step 6: Commit** (`feat(campaign): nodemailer cold-mailer (SMTP->Brevo), no-op without creds`). Stage only `src/services/cold-mailer.ts tests/unit/test-cold-mailer.ts package.json package-lock.json`.

---

### Task 4: Open-calls-per-rubro count (the hook N)

**Files:** Create `src/jobs/campaign/open-calls-count.ts`; Test `tests/unit/test-open-calls-count.ts`

**Interfaces produced:** `buildOpenCallCountQuery(rubroCode: string, now: Date): object`; `countOpenCallsByRubro(codes: string[], now: Date): Promise<Map<string, number>>`

- [ ] **Step 1: Failing test** (assert the pure query shape):

```ts
// tests/unit/test-open-calls-count.ts
import assert from "node:assert";
import { buildOpenCallCountQuery } from "../../src/jobs/campaign/open-calls-count";
const now = new Date("2026-07-19T00:00:00Z");
const q: any = buildOpenCallCountQuery("28267", now);
assert.equal(q.status, "open");
assert.deepEqual(q.classificationSet, "28267");
assert.deepEqual(q["tenderPeriod.endDate"], { $gt: now });
console.log("ok: open-calls count query");
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/jobs/campaign/open-calls-count.ts
import { OpenCallModel } from "../../../shared/models/open_call";
export function buildOpenCallCountQuery(rubroCode: string, now: Date): object {
  return { status: "open", classificationSet: rubroCode, "tenderPeriod.endDate": { $gt: now } };
}
export async function countOpenCallsByRubro(codes: string[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const code of [...new Set(codes)]) {
    out.set(code, await OpenCallModel.countDocuments(buildOpenCallCountQuery(code, now)));
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(campaign): open-calls-per-rubro count for the hook`).

---

### Task 5: Campaign email template (es)

**Files:** Create `src/emails/campaign-templates.ts`; Test `tests/unit/test-campaign-template.ts`

**Interfaces produced:**
- `renderCampaignEmail(input: { supplierName: string; rubroLabel: string; rubroCode: string; openCount: number; unsubscribeUrl: string; ctaUrl: string; senderIdentity: string }): { subject: string; html: string; text: string }`
- `campaignHeaders(unsubscribeUrl: string, unsubscribeMailto: string): Record<string,string>`

- [ ] **Step 1: Failing test**

```ts
// tests/unit/test-campaign-template.ts
import assert from "node:assert";
import { renderCampaignEmail, campaignHeaders } from "../../src/emails/campaign-templates";
const r = renderCampaignEmail({
  supplierName: "ACME SA", rubroLabel: "Alcohol rectificado", rubroCode: "28267", openCount: 3,
  unsubscribeUrl: "https://g/u?token=t", ctaUrl: "https://g/registro?rubro=28267",
  senderIdentity: "gastos-gub · Montevideo, UY",
});
assert.ok(r.subject.includes("3") && /alcohol/i.test(r.subject));
assert.ok(r.html.includes("ACME SA") && r.html.includes("https://g/registro?rubro=28267"));
assert.ok(r.html.includes("https://g/u?token=t") && r.html.includes("gastos-gub · Montevideo, UY"));
assert.ok(r.text.includes("ACME SA") && r.text.includes("https://g/u?token=t"));
const h = campaignHeaders("https://g/u?token=t", "mailto:baja@info.gastos-gub.uy");
assert.ok(h["List-Unsubscribe"].includes("https://g/u?token=t"));
assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
console.log("ok: campaign template");
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — reuse the tone/`esc()` pattern from `src/emails/templates.ts`; inline styles; es copy. Full code:

```ts
// src/emails/campaign-templates.ts
function esc(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
}
export interface CampaignInput {
  supplierName: string; rubroLabel: string; rubroCode: string; openCount: number;
  unsubscribeUrl: string; ctaUrl: string; senderIdentity: string;
}
export function campaignHeaders(unsubscribeUrl: string, unsubscribeMailto: string): Record<string,string> {
  return {
    "List-Unsubscribe": `<${unsubscribeMailto}>, <${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
export function renderCampaignEmail(i: CampaignInput): { subject: string; html: string; text: string } {
  const n = i.openCount;
  const rubro = i.rubroLabel || "tu rubro";
  const subject = n > 0
    ? `${n} ${n === 1 ? "licitación abierta" : "licitaciones abiertas"} en ${rubro} — te avisamos gratis`
    : `Licitaciones del Estado en ${rubro} — te avisamos gratis`;
  const lead = n > 0
    ? `Hoy hay <strong>${n}</strong> ${n === 1 ? "llamado abierto" : "llamados abiertos"} del Estado en <strong>${esc(rubro)}</strong>.`
    : `El Estado publica llamados en <strong>${esc(rubro)}</strong> durante todo el año.`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f2233;max-width:560px;margin:0 auto">
  <p>Hola ${esc(i.supplierName)},</p>
  <p>${lead} Somos <strong>gastos-gub</strong>, un servicio <strong>gratuito</strong> de transparencia del gasto público.</p>
  <p>Te avisamos por email cada vez que se abre una licitación en tu rubro, para que no pierdas ninguna.</p>
  <p style="margin:28px 0">
    <a href="${esc(i.ctaUrl)}" style="background:#0f2233;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
      Activar alertas gratis en ${esc(rubro)}
    </a>
  </p>
  <p style="color:#64757f;font-size:13px">Es gratis y te podés dar de baja cuando quieras.</p>
  <hr style="border:none;border-top:1px solid #dfe4e7;margin:24px 0">
  <p style="color:#64757f;font-size:12px">
    ${esc(i.senderIdentity)}.<br>
    Recibís esto porque tu empresa figura como proveedora del Estado en registros públicos.
    <a href="${esc(i.unsubscribeUrl)}" style="color:#64757f">Darse de baja</a>.
  </p>
</div>`.trim();
  const text = [
    `Hola ${i.supplierName},`, "",
    n > 0 ? `Hoy hay ${n} ${n === 1 ? "llamado abierto" : "llamados abiertos"} del Estado en ${rubro}.`
          : `El Estado publica llamados en ${rubro} durante todo el año.`,
    `Somos gastos-gub, un servicio gratuito de transparencia del gasto público. Te avisamos por email cuando se abre una licitación en tu rubro.`,
    "", `Activar alertas gratis: ${i.ctaUrl}`, "",
    i.senderIdentity + ".",
    `Recibís esto porque tu empresa figura como proveedora del Estado en registros públicos.`,
    `Darse de baja: ${i.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(campaign): es campaign email template + List-Unsubscribe headers`).

---

### Task 6: Recipient builder (segment from supplier_contacts)

**Files:** Create `src/jobs/campaign/recipients.ts`; Test `tests/unit/test-campaign-recipients.ts`

**Interfaces produced:** `pickRecipientRubro(rubros: {classificationId:string;label:string;share:number}[]): {code:string;label:string} | null` (pure — the top rubro); `buildRecipients(db, opts): AsyncGenerator<{ supplierId; name; email; rubroCode; rubroLabel }>` that streams `supplier_contacts` with a `primaryEmail`, skips suppressed + existing users, and attaches the top rubro.

- [ ] **Step 1: Failing test** (pure part):

```ts
// tests/unit/test-campaign-recipients.ts
import assert from "node:assert";
import { pickRecipientRubro } from "../../src/jobs/campaign/recipients";
assert.equal(pickRecipientRubro([]), null);
const r = pickRecipientRubro([{classificationId:"1",label:"A",share:0.2},{classificationId:"2",label:"B",share:0.6}]);
assert.deepEqual(r, { code: "2", label: "B" }); // highest share wins
console.log("ok: campaign recipients");
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — `pickRecipientRubro` sorts by `share` desc; `buildRecipients` streams `SupplierContactModel.find({ primaryEmail: { $ne: null }, ...(opts.rubro ? {"rubros.classificationId": opts.rubro} : {}) })` sorted by `priorityScore` desc, and for each: `if (await isSuppressed(email)) continue; if (await UserModel.exists({ email })) continue;` then yield with the picked rubro. (Import `SupplierContactModel`, `UserModel`, `isSuppressed`.)

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** (`feat(campaign): recipient builder + top-rubro segmentation`).

---

### Task 7: Enqueue + dispatch (throttle, warmup, kill-switch)

**Files:** Create `src/jobs/campaign/enqueue.ts`, `src/jobs/campaign/send.ts`; Test `tests/unit/test-campaign-send-helpers.ts`

**Interfaces produced:** `enqueueCampaign(db, campaignKey, opts): Promise<number>` (materializes `campaign_sends`, one per recipient, `status:"queued"`, random token); `send.ts` a runnable job: pulls queued sends, gates on suppression, renders via `renderCampaignEmail` + live `countOpenCallsByRubro`, sends via `createColdMailer()`, records result; `--limit`, `--rate` (sends/run), `--dry-run`; pure helper `warmupCap(dayIndex: number): number` tested.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/test-campaign-send-helpers.ts
import assert from "node:assert";
import { warmupCap, makeToken } from "../../src/jobs/campaign/send";
assert.equal(warmupCap(0), 50);   // day 1 cap
assert.ok(warmupCap(5) > warmupCap(0)); // ramps up
assert.ok(warmupCap(99) <= 5000);       // capped ceiling
assert.equal(makeToken("R/1","promo1").length >= 16, true); // deterministic-ish, unique per pair
console.log("ok: campaign send helpers");
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — `warmupCap(day)` = `Math.min(5000, 50 * 2 ** day)` (50→100→200…capped 5000); `makeToken(supplierId, campaignKey)` = a hex hash of `supplierId|campaignKey|salt` (use `node:crypto` `createHash('sha256')`, no `Math.random`). `enqueueCampaign` iterates `buildRecipients`, upserts a `campaign_sends` per recipient (idempotent on `{campaignId,email}`). `send.ts` `main()`: load campaign; if `status==="paused"` abort; compute the day's cap; pull `CampaignSendModel.find({campaignId, status:"queued"}).limit(cap)`; for each: re-check `isSuppressed` (skip+mark), render with live open-count, `createColdMailer().send(...)`, set `status:"sent"`/`providerMessageId` or `status:"failed"`/`error`; **kill-switch**: after each batch compute complaint/bounce rate from `campaign_sends`; if over threshold set campaign `status:"paused"` and stop. `--dry-run` logs, writes nothing.

- [ ] **Step 4: Run — expect PASS** (helpers). **Step 5: Commit** (`feat(campaign): enqueue + throttled dispatch with warmup + kill-switch`).

---

### Task 8: Non-user unsubscribe endpoints

**Files:** Create `app/server/api/campaign/unsubscribe.get.ts`, `app/server/api/campaign/unsubscribe.post.ts`; Test `tests/unit/test-campaign-unsubscribe.ts` (pure token→email resolution helper extracted to `src/jobs/campaign/unsubscribe-core.ts`)

**Interfaces produced:** `resolveUnsubscribe(token): Promise<{ email: string } | null>` in `unsubscribe-core.ts` — looks up `campaign_sends` by token, marks it `unsubscribed`, calls `suppress(email,"unsubscribe",...)`. Endpoints are thin wrappers (GET returns a small confirmation HTML/redirect; POST is the List-Unsubscribe one-click).

- [ ] **Step 1: Failing test** for `resolveUnsubscribe` with an injected model surface (no DB). Assert: unknown token → null; known token → returns email, marks send `unsubscribed`, suppresses.

- [ ] **Step 2–4: Implement + pass.** Mirror the existing `app/server/api/unsubscribe.post.ts` shape (public, token-only, idempotent). GET can render a one-line "Te diste de baja" page; POST returns `{ success: true }`.

- [ ] **Step 5: Commit** (`feat(campaign): non-user one-click unsubscribe + suppression`). Stage only the two endpoint files + core + test.

---

### Task 9: Brevo event webhook

**Files:** Create `app/server/api/campaign/webhook.post.ts`; Test `tests/unit/test-brevo-webhook.ts` (pure event→action mapper in `src/jobs/campaign/brevo-events.ts`)

**Interfaces produced:** `mapBrevoEvent(ev: { event: string; messageId?: string; email?: string }): { status?: SendStatus; suppress?: SuppressionReason }` — pure mapping: `delivered→delivered`, `opened→opened`, `click→clicked`, `hard_bounce→{bounced, suppress:"bounce"}`, `soft_bounce→bounced`, `spam→{complained, suppress:"complaint"}`, `unsubscribed→{unsubscribed, suppress:"unsubscribe"}`.

- [ ] **Step 1: Failing test** asserting the mapping table for each event (esp. hard_bounce + spam set both a status and a suppress reason).

- [ ] **Step 2–4: Implement + pass.** The endpoint verifies a shared secret (`?secret=` query or header vs `process.env.CAMPAIGN_WEBHOOK_SECRET`), parses the Brevo payload, updates `campaign_sends` by `providerMessageId`/`email`, and calls `suppress(...)` when the mapping says so.

- [ ] **Step 5: Commit** (`feat(campaign): Brevo webhook -> send status + auto-suppress`).

---

### Task 10: `/registro?rubro=` landing → pre-create a watch

**Files:** Modify (surgical) `app/pages/registro.vue`; Create `app/server/api/watches/from-rubro.post.ts` (or reuse `watches/index.post.ts`); Test: an assertion on the watch-payload builder extracted to a pure helper.

**⚠️ `registro.vue` is an app file the concurrent owner session may be editing — re-read it immediately before editing, change only the minimal signup-success hook, stage only `registro.vue`.**

- [ ] **Step 1:** Read `registro.vue` + `app/server/api/watches/index.post.ts` to learn the signup-success hook + watch-create contract + free-tier cap.
- [ ] **Step 2:** After a successful signup, if `route.query.rubro` is a valid classification code and the user is under the free-tier watch cap, create a watch `{ name: <rubro label> , categories: [rubro], active: true }` via the existing endpoint. Pure helper `buildRubroWatchPayload(rubroCode, rubroLabel)` gets a unit test.
- [ ] **Step 3–4:** Implement + typecheck + the helper test passes.
- [ ] **Step 5: Commit** (`feat(campaign): registro ?rubro= pre-creates a tender-alert watch`).

---

### Task 11: Campaign stats script

**Files:** Create `scripts/campaign-stats.ts` (no unit test — read-only reporting).

- [ ] **Step 1:** Implement a tsx script: given `--campaign=<key>`, aggregate `campaign_sends` by `status` (queued/sent/delivered/opened/clicked/bounced/complained/unsubscribed/failed), overall + per `rubroKey`, and count signups (best-effort: `users` created after the campaign start whose email matches a `campaign_sends.email`). Print a table.
- [ ] **Step 2:** Run `npx tsx scripts/campaign-stats.ts --campaign=test` against live DB (empty campaign → all zeros, proves it runs). **Step 3: Commit** (`feat(campaign): campaign-stats funnel script`).

---

### Task 12: Pilot send (OPS-GATED — do not run without the prerequisites)

**Files:** none (operational).

**Prerequisites (Eduardo/ops):** Phase A coverage run on 167; a verified Brevo subdomain (SPF/DKIM/DMARC); `COLD_SMTP_*` + `CAMPAIGN_WEBHOOK_SECRET` env on 167; the Brevo webhook pointed at `/api/campaign/webhook?secret=…`; `APP_BASE_URL` set.

- [ ] **Step 1:** `npx tsx scripts/ensure-indexes.ts` (builds the Phase B indexes).
- [ ] **Step 2:** Create the campaign row (`EmailCampaignModel` upsert `key:"promo1"`).
- [ ] **Step 3:** `enqueue` the top rubro segment (small — e.g. one rubro) → N queued sends.
- [ ] **Step 4:** Send to a **seed list of owner-controlled addresses first** (verify inbox render, List-Unsubscribe one-click writes a suppression, the webhook updates status, `/registro?rubro=` pre-creates a watch).
- [ ] **Step 5:** Ramp per `warmupCap`; watch `campaign-stats`; stop on the kill-switch. Record results.

---

## Self-Review

**Spec coverage (Phase B):** recipients + segment (T6) ✓; suppression global (T2, gated in T6/T7) ✓; template + List-Unsubscribe + Ley footer (T5) ✓; live open-count hook (T4) ✓; nodemailer→Brevo transport, no-op without creds (T3) ✓; enqueue + throttle + warmup + kill-switch (T7) ✓; non-user unsubscribe (T8) ✓; Brevo webhook + auto-suppress (T9) ✓; registro landing + watch pre-create (T10) ✓; stats (T11) ✓; pilot (T12) ✓; models + indexes (T1) ✓.

**Placeholder scan:** none — T1–T9, T11 carry complete code or exact interfaces + full behavior; T10/T12 are surgical/operational with explicit steps.

**Type consistency:** `Mailer`/`MailMessage`/`MailResult` reused from `src/services/mailer.ts` in T3. `SuppressionReason` (T1) used by T2/T9. `SendStatus` (T1) used by T7/T9. `renderCampaignEmail`/`campaignHeaders` (T5) used by T7. `isSuppressed`/`suppress` (T2) used by T6/T7/T8/T9. `countOpenCallsByRubro` (T4) used by T7. `buildRecipients`/`pickRecipientRubro` (T6) used by T7.

**Deferred (YAGNI):** open-tracking pixel (deliverability cost); IMAP bounce-poller (Brevo webhook covers it); the `sources{}` provenance field from the spec.

**Contamination note:** only T1 (ensure-indexes) and T10 (registro.vue) touch existing shared/app files the owner's concurrent session may edit — both flagged surgical + stage-only-own-paths. Everything else is new files.
