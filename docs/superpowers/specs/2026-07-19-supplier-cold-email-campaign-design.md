# Supplier Contact Enrichment + Cold-Email Campaign — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Owner:** Eduardo

## Goal

Promote the gastos-gub **free tender-alert service** (avisos de nuevos llamados por
rubro) to the state's suppliers via a compliant cold-email campaign. This requires
first **building the recipient list** — supplier contact emails are not currently in
the database — then **sending, tracking, and complying**.

Two subsystems, **A gates B**:

- **Phase A — Supplier contact enrichment.** Populate a `supplier_contacts`
  collection with a usable contact email (+ website/phone/rubros) per supplier.
- **Phase B — Cold-email campaign.** Send a personalized, rubro-segmented cold email
  from a **separate sending provider** (isolated from transactional Resend), track
  outcomes, honor a global suppression/unsubscribe path, and land signups on
  `/registro` with the rubro pre-loaded.

Build order: **A first**, then B. This doc specs both.

## Non-goals (YAGNI)

- No general CRM. `supplier_contacts` serves enrichment + this campaign only.
- No rich campaign-builder UI. Segment + template are code/config; stats start as a
  tsx report script, not a dashboard.
- No multi-campaign A/B framework in v1. One campaign, one template (locale es).
- No paid-tier upsell in the email. The pitch is the existing free alert product.

---

## Context (verified against the live DB, 2026-07-19)

- **42,510** suppliers in `supplier_patterns`. Key = `supplierId` like `R/214843360014`.
  `supplier_patterns` and `supplier_enrichment` carry **no contact fields**.
- **`topCategories` is empty for all 42,510** suppliers — supplier→rubro is NOT
  precomputed. Rubro is derivable by aggregating a supplier's award **items'** SICE
  `classification.id` (the verified rubro join key; see SICE catalog memory).
- **Only in-DB email source = DEI** (`dei_companies`, MIEM industrial registry):
  5,249 rows, **5,070 with email**, but only ~2,458 join to a supplier by RUT
  (`digits(supplierId) === rut`). Industrial subset only.
- OCDS `releases.parties[].contactPoint.email` exists **only for buyers**
  (procuring entities), **not suppliers** (`roles: "supplier"` → 0 with email).
- **impo.com.uy** is the Diario Oficial + normativa — no business directory / RUT→email
  lookup. Company legal notices (edictos) carry emails rarely and noisily. Low yield.
- **Mail transport = Resend** (`src/services/mailer.ts`), behind a swappable `Mailer`
  interface. Env: `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `ALERTS_REPLY_TO`.
- **The tender-alert product already ships**: registered `users` create watches by
  category/keyword; `src/jobs/matching/run.ts` + `src/jobs/alerts/dispatch.ts` send
  alerts across email/push/telegram/inapp with a free-tier watch cap. **This is the
  free service the campaign sells.**
- **Unsubscribe infra exists but is user-scoped**: `app/server/api/unsubscribe.{get,post}.ts`
  resolves a `UserModel.unsubscribeToken` and sets `notificationPrefs.enabled=false`.
  Cold recipients are NOT users (no Firebase uid) → needs a non-user suppression path.
- **Scraping stack exists to reuse**: `src/parsers/cheerio-parser.ts`,
  `src/http/axios-client.ts`, `src/downloaders/*`. `contract_item_features` is precedent
  for gov HTML scraping.

## Risks (accepted, mitigated in design)

- **R1 — Resend forbids cold email.** Resend ToS is opt-in/transactional only; a
  scraped-list complaint spike can suspend the account and take **transactional tender
  alerts down with it**. **Mitigation:** cold outreach goes through a **separate
  provider/account** — nodemailer SMTP → **Brevo** (a marketing-tolerant ESP), behind the
  same `Mailer` interface. Resend stays purely transactional and is never touched by the
  cold path.
- **R2 — Uruguay Ley 18.331 (habeas data).** Marketing to scraped personal/company
  emails needs lawful basis, sender identity, working opt-out, and data-source
  disclosure. **Mitigation:** physical sender identity in footer, globally-honored
  one-click unsubscribe, suppression list, low volume + warmup, monitored reply-to,
  and a "por qué recibís esto / de dónde salió tu email" line + link.
- **R3 — Deliverability.** Cold sends burn domain reputation. **Mitigation:** separate
  **subdomain** (verified SPF/DKIM/DMARC on the cold provider), gradual warmup ramp,
  complaint-rate **kill-switch**, hard-bounce auto-suppression, MX pre-validation.

---

## Phase A — Supplier contact enrichment

### Collection `supplier_contacts` (new)

One doc per supplier, keyed by `supplierId`.

```
supplierId     string   R/214843360014 (== supplier_patterns key)   [unique index]
rut            string   digits(supplierId)                          [index]
name           string
emails         [{ email, source, confidence(0..1), isRoleAccount, mxValid, status }]
primaryEmail   string|null   best non-role, MX-valid pick
website        string|null
phone          string|null
rubros         [{ classificationId, label, itemCount, share }]  top SICE rubros
sources        { dei?, website?, webSearch?, impo?, rupe? }  raw payload + fetchedAt per source
status         'pending' | 'enriched' | 'no_contact' | 'error'
priorityScore  number   from supplier_patterns totalValue / totalContracts
enrichedAt     Date|null
createdAt/updatedAt
```

- `email.source ∈ { dei, website, webSearch, impo, rupe, manual }`.
- `email.status ∈ { candidate, valid, invalid, suppressed }`.
- Model file: `shared/models/supplier_contacts.ts`. Indexes declared here, **built by
  `scripts/ensure-indexes.ts`** (autoIndex is off globally — follow existing pattern).

### Rubro derivation (folded into enrichment)

Aggregate the supplier's award items' `classification.id` from `releases` (lead with
`awards.suppliers.id` — buyer.id is unindexed per memory), map codes → labels via
`sice_catalog`/`sice_rubro`, keep top-N by item share. Written to
`supplier_contacts.rubros`. Reused by Phase B segmentation + the hook line.

### Resolvers (tried in order, results merged into `emails[]`)

1. **DEI** — join `dei_companies` by rut → email/sitioWeb/telefono. *confidence ~0.9*,
   free (in-DB). ~2,458 hits.
2. **Website scrape** — from DEI `sitioWeb` or a search-found domain: fetch home +
   `/contacto`/`/contact`, regex emails, prefer same registrable domain over free
   webmail. Reuse cheerio + axios-client. *~0.7*.
3. **Web search** — query `"<name> <rut> uruguay contacto email"` → resolve official
   site / socials → extract. Bounded results, cached per supplier. *~0.5*.
4. **impo Diario Oficial** — search gazette by RUT/name, regex emails in edicto text.
   Best-effort. *~0.3*. (Low yield — documented, not the backbone.)
5. **RUPE** — **spike first** (separate investigation task): is programmatic/authorized
   access viable within ToS? If yes → loader (richest source, official contact email
   per state supplier). If login-gated/ToS-blocked → **defer + document**, don't block A.

Each resolver is a pure module `src/jobs/enrich/resolvers/<name>.ts` returning
`{ emails: Candidate[], website?, phone? }` so it is unit-testable in isolation.

### Orchestration `src/jobs/enrich-supplier-contacts.ts`

- Select suppliers by `priorityScore` desc (top-spend first = best campaign ROI).
- For each: run resolvers, merge, validate, write doc. Throttle external calls
  (per-host concurrency + delay). **Resumable** — skip `status !== 'pending'` unless
  stale (configurable TTL). Idempotent, source-tagged.
- Batch/limit flags (`--limit`, `--minPriority`, `--sources=dei,website`) so runs are
  scopable. Cron-registered later once proven.

### Hygiene / validation

- Format regex + `dns.resolveMx` on the registrable domain (cache MX per domain).
- **Role-account flag** for `info@|ventas@|contacto@|admin@|administracion@…` — usable
  but lower personalization; non-role preferred for `primaryEmail`.
- Dedupe/merge across sources; keep highest confidence per address.
- **Drop junk**: `example.com`, obvious gov generics, the buyer's own email, the
  supplier's known-invalid.
- `primaryEmail` = highest-confidence, non-role, MX-valid candidate (fallback: best MX-valid).

### Verification (test-less repo → tsx + dev-server, per memory)

- `tests/unit/test-contact-resolvers.ts` — assert parsing on saved HTML/JSON fixtures
  (website, web-search, impo edicto samples). No network.
- Dry-run `enrich-supplier-contacts --limit 50` on top suppliers → report coverage %
  (email found / rubros found) and source breakdown. Manual eyeball of 10 results.

---

## Phase B — Cold-email campaign

### Recipient list

Build from `supplier_contacts` where `primaryEmail` set + `mxValid` + not suppressed +
**not already a registered user** (join `users.email` — they already have the product).
Segment by `rubros` so the hook line is accurate per batch.

### Collections (new)

```
email_suppressions   { email[unique], reason: unsubscribe|bounce|complaint|manual, at, source }
email_campaigns      { key, name, subjectTemplate, status: draft|sending|paused|done, segment, createdAt }
campaign_sends       { campaignId, supplierId, email, rubroKey, token[unique],
                       status: queued|sent|delivered|opened|clicked|bounced|complained|unsubscribed,
                       providerMessageId, error, queuedAt, sentAt, updatedAt }
```

- **Suppression is global** and checked before **every** send (transactional too, later).
- `token` is the opaque per-send credential for unsubscribe + click tracking.

### Template (`src/emails/campaign-templates.ts`)

Reuse the `layout()` tone/patterns from `src/emails/templates.ts`, distinct footer.
Locale **es**. Personalized fields:

- `name`, top `rubro` label.
- **N** = count of currently-open `open_calls` in that rubro (live "should I care" signal).
- CTA button → `/registro?rubro=<classificationId>&utm_source=coldemail&utm_campaign=<key>`.
- Plain-text + HTML variants.
- **Headers:** `List-Unsubscribe: <mailto:...>, <https://.../api/campaign/unsubscribe?token=...>`
  and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Footer (Ley 18.331):** physical sender identity, one-click unsubscribe link, and a
  "por qué recibís esto / de dónde salió tu email" line linking a short explainer.

Subject: rubro-aware, e.g. `"<N> licitaciones abiertas en <rubro> — te avisamos gratis"`.

### Sending provider (separate) — nodemailer SMTP → Brevo

- New transport `src/services/cold-mailer.ts`: a `NodemailerMailer` implementing the
  existing `Mailer` interface via **nodemailer** over SMTP. nodemailer is the library,
  not the provider — the code is provider-agnostic, so the SMTP backend is swappable by
  env alone.
- Chosen backend: **Brevo** (`smtp-relay.brevo.com:587`) — transactional **+ marketing**
  ESP with SMTP relay, event webhooks, and native suppression, tolerant of legitimate
  marketing. Config via `COLD_SMTP_*` env (`COLD_SMTP_HOST`, `COLD_SMTP_PORT`,
  `COLD_SMTP_USER`, `COLD_SMTP_PASS`, `COLD_SMTP_FROM` on the verified **subdomain**).
- Resend/`createMailer()` untouched — transactional only. The cold path never touches
  the Resend account.
- Deliverability regardless of provider: warmup ramp + low volume + hard opt-out; any
  ESP suspends on high complaint rates.

### Dispatch `src/jobs/campaign/send.ts`

- Pull `campaign_sends` where `status='queued'`, ordered by supplier priority.
- **Throttle + warmup ramp**: max N/hour, ramping daily (config table). Per-send delay.
- Skip if email in `email_suppressions`. Send via `cold-mailer`. Record
  `providerMessageId` + `status='sent'`, backoff on transient errors.
- **Kill-switch**: if complaint-rate or hard-bounce-rate over the last window exceeds a
  threshold → set campaign `status='paused'` and stop. Manual resume.

### Tracking & feedback

- **Brevo event webhook** → `app/server/api/campaign/webhook.post.ts`: parse Brevo's
  event payload (`delivered`, `hard_bounce`, `soft_bounce`, `spam`, `unsubscribed`,
  `click`, `opened`) keyed by the `messageId`/tag we set at send → update `campaign_sends`;
  **`hard_bounce` / `spam` → auto-insert `email_suppressions`**. Verify the request with a
  shared secret in the webhook URL/header (Brevo has no HMAC signature).
- We also own **click-through** via the CTA link's token (works even if Brevo click
  tracking is off) and the one-click **unsubscribe** token → suppression. So bounce/
  complaint suppression is automatic (webhook) and opt-out is first-party — no IMAP
  bounce-poller needed.

### Unsubscribe (extended for non-users)

- New `app/server/api/campaign/unsubscribe.{get,post}.ts`: resolve `token` in
  `campaign_sends` → upsert `email_suppressions{reason:'unsubscribe'}` + mark send
  `status='unsubscribed'`. Idempotent, public, one-click (mirrors existing user path).
- Existing user unsubscribe endpoint stays as-is. (Optional later: unify both behind a
  single suppression check.)

### Landing conversion

- `app/pages/registro.vue` accepts `?rubro=<classificationId>`: after signup, pre-create
  a watch on that rubro (respecting the free-tier cap). Capture `utm_campaign` → attribute
  signups back to `campaign_sends` where feasible (best-effort by email match).

### Observability (v1 = script)

- `scripts/campaign-stats.ts`: sent / delivered / opened / clicked / bounced /
  complained / unsubscribed / **signups**, overall + per rubro. UI dashboard deferred.

### Verification

- Dry-run render: assert template HTML/text renders with sample supplier + rubro + N.
- Send to owner's own address via SES sandbox; confirm List-Unsubscribe one-click writes
  a suppression and marks the send.
- Webhook: post a synthetic bounce/complaint → assert auto-suppression + status update.
- Suppression gate: queued send to a suppressed email is skipped.

---

## Build order (for the implementation plan)

1. `supplier_contacts` model + `ensure-indexes` entry.
2. Rubro-derivation module + DEI resolver (in-DB, zero external) → enrich top suppliers,
   measure baseline coverage.
3. Website + web-search + impo resolvers + hygiene/MX validation.
4. RUPE viability spike (parallel; may defer).
5. `email_suppressions` + campaign collections + models.
6. `cold-mailer` (SES) transport + subdomain verification/warmup config.
7. Campaign template (es) + headers + Ley-18.331 footer.
8. `campaign/send` dispatch (throttle, warmup, kill-switch) + suppression gate.
9. Webhook + non-user unsubscribe endpoints.
10. `registro?rubro=` landing + watch pre-create.
11. `campaign-stats` script. Dry-run end-to-end to owner. Warmup send to a small pilot
    segment before full rollout.

## Open items to resolve during implementation

- RUPE access viability (spike) — determines whether it's a source or a documented gap.
- Cold provider chosen: **Brevo** via nodemailer SMTP. Still needed: the verified
  **subdomain** name + Brevo SMTP creds + the webhook shared secret.
- Warmup ramp numbers + complaint-rate kill-switch threshold.
- Physical sender identity string for the Ley-18.331 footer.
