# AI Grow Advisor — Backend Implementation Plan (PiGrow-Server)

**Goal:** Add the server-side foundation for an advisory AI layer to PiGrow — harvest outcome logging, a structured data export, a swappable LLM provider layer with a grow-advisor endpoint, deterministic anomaly alerts, and camera-snapshot plant-health vision.

**Architecture:** New `harvest-logs`, `ai`, and `alerts` modules following the existing Fastify + TypeBox + Prisma module pattern (schema/controller/routes/test, modeled on the `grow-cycle-notes` module). A swappable `AiProvider` interface (OpenAI / Anthropic via global `fetch`; local-model seam reserved) keeps providers interchangeable. Strictly advisory: no endpoint mutates devices, phase environments, or automation rules as a result of AI output.

**Tech Stack:** Fastify, TypeBox, Prisma (Postgres), vitest, Node global `fetch` for LLM calls.

**Companion plan:** the frontend surfaces for these endpoints live in `docs/superpowers/plans/2026-08-09-ai-advisor-frontend.md` (in the PiGrow-UI repo). Backend ships first; the frontend builds against the contracts defined here.

## Global Constraints

- **Advisory-only boundary:** no endpoint may mutate device targets, phase environments, or automation rules as a result of AI output. AI responses are read-only data.
- **No new runtime dependencies.** LLM calls use Node's global `fetch`. If a task genuinely needs a dep, stop and flag it.
- **Module registration in THREE places** (hard rule — missing one breaks tests or openapi:check): `src/server.ts` (prod), `src/api/modules/test-helper.ts` (tests), `scripts/export-openapi.ts` (openapi export).
- **Prisma conventions:** singular model names, no `@@map` (table name == model name). Hand-write migration SQL matching the existing migration format — Prisma 7 `migrate diff` requires a live/shadow DB; do NOT use it.
- **TypeBox/oxfmt pitfall:** lefthook's oxfmt pre-commit pass reorders object-literal keys alphabetically; TypeBox serializes string options in insertion order, so the format pass silently changes `openapi.json` and `openapi:check` fails post-commit. Write schema option literals in alphabetical order (`maxLength` before `minLength`) or regenerate openapi AFTER the format pass.
- **API keys server-side only**, from env: `AI_PROVIDER` (`openai`|`anthropic`), `AI_API_KEY`, `AI_MODEL_ADVISOR`, `AI_MODEL_VISION`, `AI_BASE_URL?`. Never sent to the client. Never committed.
- **Cost guardrails:** advisor and vision are on-demand only (no scheduled LLM calls). Export bundle downsamples telemetry to hourly min/avg/max buckets; max 720 buckets per series; notes capped at most-recent 20.
- **Gates per task:** `npx tsc --noEmit`, lint, `npm run test` (vitest), regenerate `openapi.json` (`tsx scripts/export-openapi.ts`), `openapi:check` green (`git diff --exit-code openapi.json`).
- **Intermittent flake:** `automation-engine/interval-scheduler.test.ts` ("Hysteresis: only one log row") intermittently fails — re-run once before investigating.
- **Commits:** conventional style (`feat(server): ...`), one logical change per commit, never push unless the operator asks.

## Decisions locked with the operator

- Provider swappable from day one behind `AiProvider`.
- Pure advisory — no apply paths exist anywhere.
- One harvest log per grow cycle (`@@unique([growCycleId])`).
- On-demand triggers only for advisor + vision.
- Tier 4 (RAG over historical cycles) deferred until ≥5 completed cycles with harvest logs exist.

---

## File Structure

**New:**

```
src/api/modules/harvest-logs/
  harvest-logs.schema.ts / harvest-logs.controller.ts / harvest-logs.routes.ts / harvest-logs.test.ts
src/api/modules/ai/
  ai.schema.ts / ai.bundle.ts / ai.controller.ts / ai.routes.ts / ai.prompts.ts / ai.test.ts
src/ai/providers/
  types.ts / factory.ts / openai.ts / anthropic.ts (+ provider tests)
src/api/modules/alerts/
  alerts.schema.ts / alerts.controller.ts / alerts.routes.ts / alerts.test.ts
src/ai/anomaly/
  detector.ts / job.ts (+ tests)
prisma/migrations/<ts>_add_harvest_log/migration.sql
prisma/migrations/<ts>_add_grow_alert/migration.sql
prisma/migrations/<ts>_add_snapshot_analysis/migration.sql
```

**Modified:** `prisma/schema.prisma`, `src/server.ts`, `src/api/modules/test-helper.ts`, `scripts/export-openapi.ts`, `src/plugins/swagger.ts` (tag descriptions), `API.md`, `openapi.json` (regenerated), server README/env docs.

---

## Task 1: HarvestLog Prisma model + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_harvest_log/migration.sql`

Add to `schema.prisma`:

```prisma
model HarvestLog {
  id                 String    @id @default(uuid())
  growCycleId        String    @unique
  growCycle          GrowCycle @relation(fields: [growCycleId], references: [id], onDelete: Cascade)
  completedAt        DateTime  @default(now())
  yieldGrams         Int?
  qualityRating      Int? // 1-5
  pestOrDiseaseNotes String?
  whatWorked         String?
  whatToImprove      String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}
```

And on `GrowCycle`: `harvestLog HarvestLog?`

- [ ] Hand-write the migration SQL (CreateTable + unique index on `growCycleId` + AddForeignKey with cascade), matching the format of the grow_cycle_notes migration.
- [ ] `npx prisma generate`; apply the migration per the repo's usual dev flow.
- [ ] Commit: `feat(server): add HarvestLog model`

## Task 2: harvest-logs module

**Files:**

- Create: `src/api/modules/harvest-logs/{harvest-logs.schema.ts,harvest-logs.controller.ts,harvest-logs.routes.ts,harvest-logs.test.ts}`
- Modify: the three registration points + `src/plugins/swagger.ts` (tag `HarvestLog`)

Model on the `grow-cycle-notes` module exactly. Endpoints (singular nested resource):

| Method | Path                                    | Success                                       | Errors    |
| ------ | --------------------------------------- | --------------------------------------------- | --------- |
| GET    | `/api/grow-cycles/:cycleId/harvest-log` | 200 HarvestLog                                | 404       |
| PUT    | `/api/grow-cycles/:cycleId/harvest-log` | 200 HarvestLog (upsert on unique growCycleId) | 400 / 404 |
| DELETE | `/api/grow-cycles/:cycleId/harvest-log` | 204                                           | 404       |

TypeBox schemas (option keys alphabetical — see Global Constraints):

```ts
export const HarvestLogSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  growCycleId: Type.String({ format: 'uuid' }),
  completedAt: Type.String({ format: 'date-time' }),
  yieldGrams: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  qualityRating: Type.Union([Type.Integer({ maximum: 5, minimum: 1 }), Type.Null()]),
  pestOrDiseaseNotes: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
  whatWorked: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
  whatToImprove: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

export const UpsertHarvestLogSchema = Type.Object({
  pestOrDiseaseNotes: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  qualityRating: Type.Optional(Type.Union([Type.Integer({ maximum: 5, minimum: 1 }), Type.Null()])),
  whatToImprove: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  whatWorked: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  yieldGrams: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
})
```

- [ ] Controller: `getHarvestLog`, `upsertHarvestLog` (Prisma `upsert`), `deleteHarvestLog`. 404 when the cycle doesn't exist (check first, as grow-cycle-notes does).
- [ ] Tests: GET 404 when none; PUT creates; PUT updates same row (same id); validation errors (qualityRating 0/6, yieldGrams -1 → 400); DELETE 204 then GET 404; unknown cycle 404; cascade delete.
- [ ] Register in all three entry points; regenerate openapi; gates green.
- [ ] Commit: `feat(server): add harvest-logs module`

## Task 3: ai module — export bundle + endpoint

**Files:**

- Create: `src/api/modules/ai/{ai.schema.ts,ai.bundle.ts,ai.controller.ts,ai.routes.ts,ai.test.ts}`
- Modify: the three registration points + swagger tag (`AI`)

`ai.bundle.ts` — pure assembler, no HTTP:

```ts
export interface GrowExportBundle {
  cycle: {
    id: string
    name: string
    startAt: string
    endAt: string | null
    isActive: boolean
    metadata: Record<string, unknown>
  }
  phases: Array<{
    id: string
    name: string
    startAt: string
    endAt: string
    dayEnv: unknown
    nightEnv: unknown
    phBand: unknown
  }>
  telemetrySummary: {
    bucketMinutes: number
    from: string
    to: string
    series: Array<{
      sensorId: string
      sensorType: string
      unit: string
      buckets: Array<{ at: string; min: number; avg: number; max: number }>
    }>
  }
  deviceEvents: Array<{
    deviceId: string
    deviceName: string
    deviceType: string
    onTransitions: number
    totalOnMinutes: number
  }>
  dosingEvents: Array<{
    at: string
    nutrientName: string
    amountMl: number
    phAfter: number | null
    ecAfter: number | null
  }>
  notes: Array<{ at: string; phaseId: string | null; title: string | null; note: string }>
  alerts: unknown[] // populated by Task 7; empty array until then
  vision: unknown[] // populated by Task 8; empty array until then
  harvestLog: unknown | null
}

export async function assembleExportBundle(
  cycleId: string,
  opts?: { from?: Date; to?: Date; bucketMinutes?: number },
): Promise<GrowExportBundle>
```

Behavior:

- Load cycle + phases + environments + metadata; throw/404 if missing.
- Telemetry: per sensor, query the window (default cycle start → now, capped at 30 days), bucket into `bucketMinutes` (default 60), min/avg/max per bucket. Reuse the telemetry module's range query rather than duplicating SQL. Cap at 720 buckets/series.
- Device events: ON-transition count + total on-minutes from device state logs in the window.
- Dosing events + notes (most recent 20) + harvest log.

Route: `GET /api/grow-cycles/:cycleId/ai-export?from=&to=&bucketMinutes=` → 200 bundle | 404.

- [ ] Tests: 404 unknown cycle; all top-level keys present; bucketing math correct on a known fixture; window capping; empty windows → empty series, not errors.
- [ ] Register in 3 places; regenerate openapi; gates green.
- [ ] Commit: `feat(server): add ai module with grow-cycle export bundle`

## Task 4: AiProvider interface + factory + OpenAI/Anthropic impls

**Files:**

- Create: `src/ai/providers/{types.ts,factory.ts,openai.ts,anthropic.ts}` + co-located tests

```ts
// types.ts
export interface AdvisorResponse {
  healthSummary: string
  issues: Array<{
    severity: 'info' | 'warning' | 'critical'
    category: 'environment' | 'feeding' | 'equipment' | 'other'
    description: string
    suggestedAdjustment: string
    confidence: 'low' | 'medium' | 'high'
    rationale: string
  }>
  environmentalSuggestions: Array<{
    target: string
    currentValue: number | null
    suggestedValue: number
    unit: string
    phase: string
    rationale: string
  }>
  feedingSuggestions: Array<{
    target: string
    currentValue: number | null
    suggestedValue: number
    unit: string
    rationale: string
  }>
  prioritizedActions: string[]
}

export interface VisionResponse {
  summary: string
  healthScore: number | null // 1-10
  findings: Array<{
    category: 'deficiency' | 'excess' | 'pest' | 'mold' | 'canopy' | 'other'
    description: string
    confidence: 'low' | 'medium' | 'high'
  }>
}

export class AiNotConfiguredError extends Error {}
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface AiProvider {
  analyze(bundle: unknown, systemPrompt: string): Promise<AdvisorResponse>
  describeImage(
    imageBase64: string,
    mimeType: string,
    systemPrompt: string,
  ): Promise<VisionResponse>
}
```

- `factory.ts`: `getAiProvider()` reads `AI_PROVIDER`; throws `AiNotConfiguredError` when unset or key missing; caches the instance.
- `openai.ts`: POST `https://api.openai.com/v1/chat/completions` via global fetch; JSON-mode response; vision via base64 image content.
- `anthropic.ts`: POST `https://api.anthropic.com/v1/messages`; `system` param; defensive JSON extraction.
- Both: parse defensively (extract first `{...}` block), minimal-shape validate, throw `AiProviderError` on HTTP/parse failure. Model names from env with sane defaults.
- [ ] Tests: mock global fetch; provider selection; error mapping; JSON extraction from markdown-wrapped responses; request shapes for both providers.
- [ ] Commit: `feat(server): swappable AI provider layer`

## Task 5: ai-analyze endpoint

**Files:**

- Modify: `src/api/modules/ai/{ai.schema.ts,ai.controller.ts,ai.routes.ts,ai.prompts.ts,ai.test.ts}`

`ai.prompts.ts` exports `ADVISOR_SYSTEM_PROMPT`: expert cannabis cultivation advisor; receives a structured JSON bundle (document every bundle field in the prompt); must return ONLY JSON matching `AdvisorResponse`; cite specific data points; never invent readings; say so when data is absent; phase-appropriate, small safe deltas; advisory only.

Route: `POST /api/grow-cycles/:cycleId/ai-analyze` (body `{ windowDays?: number }`). Controller: assemble bundle → provider → return AdvisorResponse JSON. `AiNotConfiguredError` → 503 with clear message; provider failure → 502.

- [ ] Tests: 503 unconfigured; 502 on provider failure (mock fetch); success returns parsed AdvisorResponse; window passed through.
- [ ] Regenerate openapi; gates green.
- [ ] Commit: `feat(server): ai-analyze advisor endpoint`

## Task 6: GrowAlert model + alerts module

**Files:**

- Modify: `prisma/schema.prisma` + new migration `add_grow_alert`
- Create: `src/api/modules/alerts/{alerts.schema.ts,alerts.controller.ts,alerts.routes.ts,alerts.test.ts}`

```prisma
model GrowAlert {
  id                String    @id @default(uuid())
  growCycleId       String
  growCycle         GrowCycle @relation(fields: [growCycleId], references: [id], onDelete: Cascade)
  severity          String    // info | warning | critical
  category          String    // env | feeding | device | schedule
  sensorType        String?
  message           String
  detectedAt        DateTime  @default(now())
  resolvedAt        DateTime?
  telemetrySnapshot Json?

  @@index([growCycleId, resolvedAt])
}
```

GrowCycle gets `alerts GrowAlert[]`.

Endpoints: `GET /api/grow-cycles/:cycleId/alerts?resolved=` → 200 GrowAlert[] (default unresolved only); `PATCH /api/alerts/:id` body `{ resolved: boolean }` → 200 | 404.

- [ ] Migration (hand-written), module, 3-point registration, tests (list filter, resolve/unresolve, 404s), openapi regen, gates.
- [ ] Commit: `feat(server): grow alerts module`

## Task 7: Anomaly detector + job + bundle wiring

**Files:**

- Create: `src/ai/anomaly/{detector.ts,job.ts}` + tests
- Modify: `src/server.ts` (start job when enabled), `src/api/modules/ai/ai.bundle.ts` (populate `alerts` with unresolved alerts)

`detector.ts` — pure functions over telemetry windows:

- z-score per sensor over rolling 6h window; flag |z| > 3
- rate-of-change: temp Δ > 3°C / 10 min (per-type thresholds)
- sustained-out-of-band: reading outside the active phase env band > 15 min
- device short-cycling: > 8 toggles/hour

`job.ts`: interval job (default 5 min, env `ALERT_SCAN_INTERVAL_MS`, disabled when `ALERTS_ENABLED=false`) over active cycles. Idempotent: skip when an unresolved alert with the same (growCycleId, category, sensorType, message) exists. Auto-resolve when the condition clears for 2 consecutive scans.

- [ ] Tests: each detector rule on fixtures; idempotency; auto-resolution; disabled flag.
- [ ] Bundle `alerts` now populated; bundle tests updated.
- [ ] Gates green; commit: `feat(server): anomaly detection job + alert lifecycle`

## Task 8: Snapshot vision analysis endpoint

**Files:**

- Modify: `prisma/schema.prisma` (CameraSnapshot += `analysis Json?`, `analysisSummary String?`) + migration `add_snapshot_analysis`
- Modify: `src/api/modules/ai/{ai.controller.ts,ai.routes.ts,ai.prompts.ts,ai.schema.ts,ai.test.ts}`

Route: `POST /api/camera-snapshots/:id/analyze`. Controller: load snapshot; fetch the image bytes server-side from the snapshot's stored location (check how snapshots are stored/served first — do NOT send a server URL to the provider; base64 the bytes); `describeImage` with `VISION_SYSTEM_PROMPT` (leaf color; suspected deficiency/excess N/P/K/Ca/Mg/S/Fe; pest signs; mold/mildew; canopy density; health 1–10; return ONLY VisionResponse JSON; "insufficient image quality" when unreadable); persist `analysis` + `analysisSummary`; 200 VisionResponse. 503 unconfigured; 502 provider failure; 404 unknown snapshot.

Also update `ai.bundle.ts`: `vision` array populated with the most recent analyzed-snapshot summaries for the cycle (cap 10).

- [ ] Tests: persistence shape; error mapping; 503; bundle vision wiring.
- [ ] Gates green; commit: `feat(server): camera snapshot vision analysis`

## Task 9: Docs + final gates

- [ ] `API.md`: document all new endpoints (harvest-log ×3, ai-export, ai-analyze, alerts ×2, snapshot analyze).
- [ ] Server README/env docs: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL_ADVISOR`, `AI_MODEL_VISION`, `ALERTS_ENABLED`, `ALERT_SCAN_INTERVAL_MS`.
- [ ] `openapi.json` regenerated; `openapi:check` green; full suite green.
- [ ] Commit: `docs(server): AI advisor endpoints + env config`

---

## Self-Review notes

- Contracts the frontend plan depends on: `HarvestLog`, `GrowExportBundle`, `AdvisorResponse`, `VisionResponse`, `GrowAlert` shapes + the endpoint table — all defined here; the frontend plan mirrors them.
- Type consistency: `assembleExportBundle`, `getAiProvider`, `AiProvider.analyze/describeImage`, `ADVISOR_SYSTEM_PROMPT`, `VISION_SYSTEM_PROMPT` named once, referenced everywhere.
- Deferred: Tier 4 RAG, scheduled advisor runs, auto-analyze-on-capture.
