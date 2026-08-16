# AI Grow Advisor — Frontend Implementation Plan (PiGrow-UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the UI surfaces for the advisory AI layer — harvest log capture, an AI Advisor tab, an alerts badge/panel, and vision-analysis overlays — consuming the backend endpoints defined in the companion plan.

**Architecture:** New Pinia stores surfaced through the `useApiStore` facade, one new grow-monitor tab (AI Advisor), a shared HarvestLogDialog, an alerts badge on the monitor hero, and vision overlays on the camera surfaces. No sockets are added. Pure advisory — no apply buttons anywhere.

**Tech Stack:** Vue 3.5 (`<script setup lang="ts">`), PrimeVue 4.5.5, Pinia, vue-router, vitest.

**Companion plan:** `docs/superpowers/plans/2026-08-09-ai-advisor-backend.md`. The backend ships first; this plan builds against the API contract below. If an endpoint deviates from the contract, STOP and flag it — do not improvise.

## Global Constraints

- **All state through the `useApiStore` facade.** New domain stores are created in `src/stores/` and re-exposed through `apiStore.ts`; views never import domain stores directly.
- **Every store gets a `loading` ref** (toggled true/false around axios calls in try/finally) and is exposed in the return object — the established convention.
- **Error handling:** `extractApiError` from `src/utils/errors.ts` for all error toasts; PrimeVue `useToast`/`useConfirm`.
- **`data-testid`** on interactive/dynamic elements; co-located `*.test.ts`; shared fixtures from `src/utils/testStub.ts`.
- **PrimeVue components imported individually** (`import Dialog from 'primevue/dialog'`); async tab children via `defineAsyncComponent`.
- **Empty string → null** when mapping form fields to nullable payload fields (never send `""`).
- **No new dependencies.** No behavior changes outside this plan's scope.
- **Gates per task:** `npm run type-check` (vue-tsc --build — NOT `type-check:fast`/tsgo, which has a known array-narrowing coverage hole), `npm run lint` (0 errors; ≤40 warnings baseline), `npm run test`, `npm run build`.
- **Commits:** conventional style (`feat(ui): ...`), explicit paths only, never push unless the operator asks.

## API contract (from the backend plan — build against exactly this)

### Harvest log (singular nested resource)

| Method | Path                                    | Success                   | Errors                  |
| ------ | --------------------------------------- | ------------------------- | ----------------------- |
| GET    | `/api/grow-cycles/:cycleId/harvest-log` | 200 `HarvestLog`          | 404 (no log / no cycle) |
| PUT    | `/api/grow-cycles/:cycleId/harvest-log` | 200 `HarvestLog` (upsert) | 400 / 404               |
| DELETE | `/api/grow-cycles/:cycleId/harvest-log` | 204                       | 404                     |

```ts
export interface HarvestLog {
  id: string
  growCycleId: string
  completedAt: string
  yieldGrams: number | null
  qualityRating: number | null // 1-5
  pestOrDiseaseNotes: string | null
  whatWorked: string | null
  whatToImprove: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertHarvestLogPayload {
  yieldGrams?: number | null
  qualityRating?: number | null
  pestOrDiseaseNotes?: string | null
  whatWorked?: string | null
  whatToImprove?: string | null
}
```

### AI advisor

| Method | Path                                                                  | Success                | Errors                                                 |
| ------ | --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| GET    | `/api/grow-cycles/:cycleId/ai-export?from=&to=&bucketMinutes=`        | 200 `GrowExportBundle` | 404                                                    |
| POST   | `/api/grow-cycles/:cycleId/ai-analyze` body `{ windowDays?: number }` | 200 `AdvisorResponse`  | 404 / 503 (AI not configured) / 502 (provider failure) |

```ts
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
```

### Alerts

| Method | Path                                           | Success                                     | Errors |
| ------ | ---------------------------------------------- | ------------------------------------------- | ------ |
| GET    | `/api/grow-cycles/:cycleId/alerts?resolved=`   | 200 `GrowAlert[]` (default unresolved only) | 404    |
| PATCH  | `/api/alerts/:id` body `{ resolved: boolean }` | 200 `GrowAlert`                             | 404    |

```ts
export interface GrowAlert {
  id: string
  growCycleId: string
  severity: 'info' | 'warning' | 'critical'
  category: 'env' | 'feeding' | 'device' | 'schedule'
  sensorType: string | null
  message: string
  detectedAt: string
  resolvedAt: string | null
}
```

### Vision

| Method | Path                                | Success              | Errors          |
| ------ | ----------------------------------- | -------------------- | --------------- |
| POST   | `/api/camera-snapshots/:id/analyze` | 200 `VisionResponse` | 404 / 503 / 502 |

`CameraSnapshot` gains `analysis?: unknown | null` and `analysisSummary?: string | null` on all GET responses.

```ts
export interface VisionResponse {
  summary: string
  healthScore: number | null // 1-10
  findings: Array<{
    category: 'deficiency' | 'excess' | 'pest' | 'mold' | 'canopy' | 'other'
    description: string
    confidence: 'low' | 'medium' | 'high'
  }>
}
```

---

## File Structure

**New:**

```
src/stores/harvestLogStore.ts
src/stores/aiStore.ts            — analyze + ai-export actions
src/stores/alertStore.ts         — list/resolve alerts
src/components/HarvestLogDialog.vue (+ test)
src/views/grow-monitor/AiAdvisorTab.vue (+ test)
src/views/grow-monitor/AlertsPanel.vue (+ test)
```

**Modified:** `src/types/grow.ts`, `src/stores/apiStore.ts`, `src/views/grow-monitor/GrowMonitorView.vue` (new tab + alerts badge), `src/views/AdminView.vue` (Log harvest action), `src/views/grow-monitor/OverviewTab.vue` (harvest card), `src/views/grow-monitor/LiveFeedTab.vue` + `CameraTile.vue` + `SnapshotGallery.vue` (vision overlays).

---

## Task 1: Types + harvestLogStore + facade

**Files:**

- Modify: `src/types/grow.ts`, `src/stores/apiStore.ts`
- Create: `src/stores/harvestLogStore.ts`

- [ ] Add `HarvestLog` and `UpsertHarvestLogPayload` to `src/types/grow.ts` (verbatim from the contract above).
- [ ] Create `harvestLogStore.ts` mirroring `growCycleNoteStore.ts`: `loading` ref, actions `get(cycleId): Promise<HarvestLog | null>` (map 404 → null, don't toast), `upsert(cycleId, payload): Promise<HarvestLog>`, `remove(cycleId): Promise<void>`.
- [ ] Facade: `harvestLogs: { get: harvestLogStore.get, upsert: harvestLogStore.upsert, remove: harvestLogStore.remove }` in `apiStore.ts`.
- [ ] Gates green. Commit: `feat(ui): harvest log types + store`

## Task 2: HarvestLogDialog + surfaces

**Files:**

- Create: `src/components/HarvestLogDialog.vue` (+ `HarvestLogDialog.test.ts`)
- Modify: `src/views/AdminView.vue`, `src/views/grow-monitor/OverviewTab.vue`

Dialog — model on `GrowNoteDialog.vue` / `DosingLogForm.vue`:

- `v-model:visible`; props `{ cycleId: string }`; emits `saved`.
- Fields: yieldGrams (InputNumber, min 0, allowEmpty); qualityRating (Select with options 1–5 — check PrimeVue Rating availability first, Select is the safe choice); three Textareas (maxlength 2000): pestOrDiseaseNotes, whatWorked, whatToImprove.
- On open: `apiStore.harvestLogs.get(cycleId)`; 404 → blank create form; existing → prefill (edit mode).
- Empty string → null on save. Client-side validation: rating 1–5, yield ≥ 0. `canSave` computed + `:loading="saving"` on the Save button (audit Round-3 convention). Error toast via `extractApiError`.

Surfaces:

- `AdminView.vue`: on grow-cycle rows where the cycle is completed (not `isActive`), a "Log harvest" action button opening the dialog.
- `OverviewTab.vue`: if the monitor's cycle has a harvest log → compact "Harvest" card (yield, rating, notes); if completed and no log → "Log harvest" prompt button.

- [ ] Tests: create vs edit mode, validation bounds, null-mapping, AdminView action visible only on completed cycles, OverviewTab card render.
- [ ] Gates green. Commit: `feat(ui): harvest log dialog + admin/monitor surfaces`

## Task 3: aiStore + AI Advisor tab

**Files:**

- Create: `src/stores/aiStore.ts`, `src/views/grow-monitor/AiAdvisorTab.vue` (+ test)
- Modify: `src/types/grow.ts` (`AdvisorResponse`), `src/stores/apiStore.ts`, `src/views/grow-monitor/GrowMonitorView.vue`

Store: `aiStore.ts` with `loading` ref + `analyzing` ref; actions `analyze(cycleId, windowDays?): Promise<AdvisorResponse>` and `fetchExport(cycleId, opts?): Promise<GrowExportBundle>` (used for debugging/download later; wire the action, the tab doesn't need to render it). Facade: `ai: { analyze, fetchExport }`.

Tab — `defineAsyncComponent` in GrowMonitorView, TabList entry `{ value: 'ai-advisor', icon: 'pi pi-sparkles', label: 'AI' }` + TabPanel. Reads `cycleId` via `useProvidedGrowMonitorState()`.

Content:

- Header row: "Analyze now" Button (`:loading="analyzing"`, disabled while analyzing) + last-analyzed timestamp.
- States: **not-configured** (503 → info Message "AI provider not configured — set AI_PROVIDER and AI_API_KEY on the server"); **error** (other failures → Message + Retry button, DosingLogHistory pattern); **empty** (no analysis yet → friendly empty state); **loading**.
- Results: health summary Card; issues list with severity-colored Tags (critical= danger, warning=warning, info=info) + confidence Tag + rationale; two sections "Environmental suggestions" and "Feeding suggestions" rendering target / current → suggested / unit / phase / rationale; "Prioritized actions" ordered list.
- Pure advisory: NO apply buttons anywhere.

- [ ] Tests: all four states render; analyze click calls store; findings render; 503 → not-configured message.
- [ ] Gates green. Commit: `feat(ui): AI Advisor tab`

## Task 4: alertStore + alerts badge + panel

**Files:**

- Create: `src/stores/alertStore.ts`, `src/views/grow-monitor/AlertsPanel.vue` (+ test)
- Modify: `src/types/grow.ts` (`GrowAlert`), `src/stores/apiStore.ts`, `src/views/grow-monitor/GrowMonitorView.vue`

Store: `alertStore.ts` keyed by cycleId (`Record<string, GrowAlert[]>`), `loading` ref; actions `list(cycleId, resolved?)`, `setResolved(alertId, resolved)`; facade `alerts: { list, setResolved }`.

UI:

- `GrowMonitorView.vue` hero: a severity-colored count chip (unresolved count) next to the tabs, click opens `AlertsPanel`. Loads on mount via the provided cycle id; re-fetches when the tab becomes active or on a 60s poll (simple `setInterval` with cleanup — no sockets).
- `AlertsPanel.vue` (Dialog): list of alerts — severity Tag, category, message, detectedAt (local `toLocaleString` copy is acceptable; a shared formatter is a separate parked cleanup), resolve/unresolve Button per row with `:loading` per-row. Empty state when no alerts.

- [ ] Tests: badge count reflects unresolved only; list render; resolve flow updates the badge.
- [ ] Gates green. Commit: `feat(ui): grow alerts badge + panel`

## Task 5: Vision overlays

**Files:**

- Modify: `src/types/grow.ts` (`CameraSnapshot` += `analysis?: unknown | null`, `analysisSummary?: string | null`; add `VisionResponse`), `src/stores/apiStore.ts` (`analyzeSnapshot` action — add to `aiStore.ts` and facade), `src/views/grow-monitor/CameraTile.vue`, `src/views/grow-monitor/LiveFeedTab.vue`, `src/views/grow-monitor/SnapshotGallery.vue`
- Co-located test updates.

- `CameraTile.vue`: "Analyze" icon Button (`aria-label="Analyze snapshot"`, `:loading` while running) → `apiStore.ai.analyzeSnapshot(latestSnapshotId)` → on success show `analysisSummary` + health-score badge on the tile.
- `SnapshotGallery.vue`: thumbnails with `analysisSummary` get a small badge/overlay; the existing detail view renders the summary + findings list.
- On-demand only — no auto-analysis on capture.

- [ ] Tests: analyze button flow; overlay renders when `analysisSummary` present; absent when null.
- [ ] Gates green. Commit: `feat(ui): snapshot vision analysis overlays`

## Task 6: Final gates

- [ ] Full gates on the UI repo: type-check, lint (0 errors), test, build.
- [ ] Confirm every contract type matches the backend plan verbatim (spot-check `AdvisorResponse` field names).
- [ ] Commit any stragglers; report.

---

## Self-Review notes

- Contract coverage: harvest log ✓ (T1/T2), advisor ✓ (T3), alerts ✓ (T4), vision ✓ (T5). Export bundle action wired but not rendered (advisor tab consumes `ai-analyze` only).
- Type consistency: `HarvestLog`, `AdvisorResponse`, `GrowAlert`, `VisionResponse` defined once in `src/types/grow.ts`, referenced everywhere.
- Advisory-only: no apply buttons, no mutation paths — verified per task.
- Deferred: shared timestamp formatter (parked cleanup), scheduled advisor runs, apply-with-confirmation flow.
