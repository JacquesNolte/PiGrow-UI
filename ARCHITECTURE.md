# Architecture

## Pattern Overview

**Overall:** Component-driven Vue 3 SPA over a Pinia facade store, with a dual-channel realtime layer (Socket.IO + REST polling fallback) and a backend that is the sole source of truth.

**Key Characteristics:**

- **Facade store** — `useApiStore` (`src/stores/apiStore.ts`) aggregates 12 domain Pinia stores into one flat API surface. Views and composables consume the facade exclusively; domain stores are never imported outside `stores/`.
- **Composition API everywhere** — all components use `<script setup lang="ts">`; no Options API, no Vuex.
- **Client-driven phase reconciliation** — the active grow phase is derived from dates on the client (`src/utils/growDates.ts`), then the server's `isActive` flag is reconciled to match. The UI never trusts `isActive` alone.
- **Dual realtime channels** — Socket.IO for push events with REST polling as fallback; every socket has a cleanup path on unmount.
- **Optimistic updates with rollback** — device toggles and rule toggles apply locally first, then confirm or revert against the server response.
- **Dark-first theming** — PrimeVue Aura preset overridden inline in `src/main.ts` with a green accent; design tokens in `src/assets/design-tokens.css`. The `.app-dark` class is applied at boot and never toggled.

## Layers

**App Shell / Bootstrap:**

- Purpose: mount the app, register plugins, define the theme, start global device-presence socket.
- Location: `src/main.ts`, `src/App.vue`
- Contains: `createApp` wiring, PrimeVue `AppPreset` (Aura-based, green primary `#22c55e`, dark surface palette), Pinia/Router/Toast/ConfirmationService registration, top-level `<router-view>` and global `<Toast>`.
- Depends on: Pinia, Vue Router, PrimeVue, `useDevicePresence`.
- Used by: every route (renders inside `App.vue`'s `.app-shell`).

**Routing:**

- Purpose: map URLs to page views.
- Location: `src/router.ts`
- Contains: `createWebHistory` routes for home, admin, controller create/edit/scan, grow create/edit, grow-monitor (`/grow/:id`), nutrients, and a catch-all 404.
- Depends on: `src/views/*`.
- Used by: `App.vue` `<router-view>`.
- Note: heavy grow-monitor tabs (`HistoryTab`, `PlanTab`, `NutrientsTab`, `LiveFeedTab`, `NotesTab`) are loaded with `defineAsyncComponent` inside `GrowMonitorView.vue`, not via route-level lazy loading.

**Views:**

- Purpose: page-level components grouped into two domains — admin CRUD and the live grow-monitor dashboard.
- Location: `src/views/`
- Contains: `HomeView.vue` (active-cycle overview), `AdminView.vue` (controllers + grows management), `NotFoundView.vue`, `admin/` (form views), `grow-monitor/` (the monitor shell + tab views + dialogs).
- Depends on: `useApiStore`, composables, PrimeVue components, `src/types/grow.ts`, `src/utils/`.
- Used by: `src/router.ts`.

**State (Pinia stores):**

- Purpose: own reactive state slices and the Axios calls that mutate them.
- Location: `src/stores/`
- Contains: `apiStore.ts` (facade), `apiBase.ts` (single `API_BASE` constant), and 12 domain stores — `controllerStore`, `deviceStore`, `growCycleStore`, `growPhaseStore`, `nutrientStore`, `phaseNutrientStore`, `sensorStore`, `telemetryStore`, `automationRuleStore`, `dosingLogStore`, `cameraStore`, `growCycleNoteStore`.
- Depends on: Axios, `API_BASE`, `src/types/grow.ts`.
- Used by: `useApiStore` (which is then used everywhere else).

**Composables:**

- Purpose: reusable reactive logic — realtime connections, derived display state, form guards.
- Location: `src/composables/`
- Contains: `useLiveTelemetry.ts`, `useDevicePresence.ts`, `useAutomationMonitor.ts`, `useUnsavedGuard.ts`, `useEnvRuleCoverage.ts`.
- Depends on: Socket.IO client, `API_BASE`, Pinia stores, `src/types/grow.ts`, `src/utils/`.
- Used by: views and the grow-monitor orchestrator.

**Components:**

- Purpose: presentational pieces and dialogs shared across views.
- Location: `src/components/`
- Contains: charts (`TelemetryChart.vue`, `DeviceHistoryChart.vue`), diagrams (`GpioPinoutDiagram.vue`, `WiringDiagram.vue`), and form/dialog components (`PhaseRuleForm.vue`, `PhaseAutomationRulesDialog.vue`, `PhaseNutrientList.vue`, `PhasePhBandEditor.vue`, `NutrientList.vue`, `DosingLogForm.vue`, `DosingCalculatorDialog.vue`).
- Depends on: PrimeVue, Chart.js (`vue-chartjs`), `src/types/grow.ts`, `src/utils/`, sometimes `useApiStore`.
- Used by: views and other components.

**Domain Types:**

- Purpose: the entire domain model in one file.
- Location: `src/types/grow.ts`
- Contains: enums (`DeviceType`, `SensorType`, `SensorProtocol`, `AutomationMode`, `DayNightPeriod`, `RuleCondition`, `DeviceAction`) and interfaces for every entity (`Device`, `Sensor`, `Controller`, `GrowCycle`, `GrowPhase`, `PhaseEnvironment`, `AutomationRule`, `Telemetry`, `Nutrient`, `PhaseNutrient`, `DosingLog`, `Camera`, `CameraSnapshot`, `GrowCycleNote`) plus their seed/payload variants.
- Used by: every other layer.

**Utilities:**

- Purpose: pure, framework-free functions for dates, validation, display formatting, and defaults.
- Location: `src/utils/`
- Contains: `growDates.ts` (phase/progress date math), `growAutomationDefaults.ts` (default rule specs per device type), `growPhaseDefaults.ts`, `automationRuleValidation.ts`, `automationRuleDisplay.ts`, `sensors.ts` (sensor options + boundary mapping), `useEnvRuleCoverage.ts`-adjacent coverage logic, `errors.ts` (`extractApiError`), `chartTimeAxis.ts`, `dosingWarnings.ts`, `snapshotFormat.ts`, `wiring.ts`, `testStub.ts` (test fixtures).
- Used by: stores, composables, views, components.

**Static Data:**

- Purpose: reference data that does not come from the backend.
- Location: `src/data/gpio-pins.ts`
- Contains: the Raspberry Pi 40-pin GPIO pinout (left/right columns, pin kinds, bus families) backing `GpioPinoutDiagram.vue` and `WiringDiagram.vue`.

## Data Flow

**REST CRUD (standard read/write):**

1. View calls a method on `useApiStore` — `src/stores/apiStore.ts`
2. Facade delegates to the domain store method — e.g. `growCycleStore.fetchGrowCycle()`
3. Domain store issues an Axios call against `API_BASE` — `src/stores/growCycleStore.ts`
4. Response is merged into the store's reactive `ref` (upsert-by-id, never a blind replace) — `src/stores/*`
5. View's `computed` reads the store and re-renders — `src/views/*`

**Live Telemetry (push + fallback):**

1. `GrowMonitorView.onMounted` calls `state.liveTelemetry.start()` — `src/views/grow-monitor/GrowMonitorView.vue`
2. `useLiveTelemetry` seeds latest readings from `GET /telemetry/grow-cycle/:id/latest`, then opens a Socket.IO connection to the API origin — `src/composables/useLiveTelemetry.ts`
3. `frontend_telemetry` events are filtered by `growCycleId` and pushed into a per-sensor history ring (capped at `MAX_HISTORY_PER_SENSOR = 500`)
4. A 30 s polling interval re-seeds from the REST endpoint as a fallback if socket events drop
5. `useGrowMonitorState` exposes `temperatureC`/`humidityPercent`/`co2Ppm`/`ecMs`/`phValue` as `computed` from `liveTelemetry.getLatest()` — `src/views/grow-monitor/useGrowMonitorState.ts`
6. `cycle_phase_changed`, `cycle_completed`, and `cycle_phase_extended` socket events trigger a `fetchGrowCycle` refresh so the dashboard tracks server-side phase transitions.

**Device Presence (global):**

1. `App.vue.onMounted` calls `useDevicePresence().start()` — `src/App.vue`
2. A single app-wide Socket.IO connection subscribes to `device_state_update` — `src/composables/useDevicePresence.ts`
3. The handler locates the owning controller and calls `deviceStore.updateDeviceInCache()` to flip `isActive` — `src/stores/deviceStore.ts`

**Device Command (dual path):**

1. A toggle in `OverviewTab` calls `state.onDeviceToggle(deviceId, checked, pin)` — `src/views/grow-monitor/useGrowMonitorState.ts`
2. If the grow-monitor socket is connected, emit `ui_command` with an ack callback; resolve on `ack.ok`, revert on miss
3. Otherwise fall back to REST `POST /devices/:id/command` via `deviceStore.sendDeviceCommand()` — `src/stores/deviceStore.ts`
4. `GrowMonitorView` also subscribes its own socket to `device_state_update` and runs a 15 s stale-check that re-polls devices if a state update was missed.

**Phase Reconciliation:**

1. `GrowMonitorView.onMounted` fetches the grow cycle + full controller record + devices, starts polling devices at 15 s — `src/views/grow-monitor/GrowMonitorView.vue`
2. `reconcileGrowState()` sorts phases, derives the active index from today's date via `deriveActivePhaseIndex()` — `src/utils/growDates.ts`
3. If the date-derived phase differs from the server's `isActive` phase, call `activateGrowPhase` (PATCH) to correct it; if no phase is date-active but one is flagged active, deactivate it
4. If `cycle.isActive` disagrees with `deriveGrowActive()`, PUT the correction; a 409 surfaces a "Controller busy" toast (another grow is running on that controller)
5. Then `loadActivePhaseEnv()` fetches day/night `PhaseEnvironment` and `automations.reload()` fetches rules for the active phase.

**Zero-Touch Controller Claiming:**

1. `ScanControllersView` polls `GET /controllers/scan` every 2 s for 30 s — `src/views/admin/ScanControllersView.vue`
2. Operator enters the 6-digit PIN read from the Pi's `journalctl`
3. `claimController()` POSTs to `/controllers/claim`; the server validates the PIN against the LAN beacon and auto-creates Controller + Sensor + Device rows — `src/stores/controllerStore.ts`
4. The claimed controller is upserted into `controllerStore.controllers`.

## Key Abstractions

**`useApiStore` Facade:**

- Purpose: one unified, flat API surface for all backend operations.
- Location: `src/stores/apiStore.ts`
- Pattern: setup-style Pinia store that instantiates all 12 domain stores, re-exposes their methods and `storeToRefs` of their state, and groups nested resources (`dosingLogs`, `growCycleNotes`, `phaseNutrients`, `dosing`) into sub-objects. New backend calls go through a domain store, then are surfaced here.

**`useGrowMonitorState` Orchestrator:**

- Purpose: bundle everything the grow-monitor dashboard needs — cycle/phase/progress, light schedule, telemetry readings, active environment, automations, device toggles — into one composable.
- Location: `src/views/grow-monitor/useGrowMonitorState.ts`
- Pattern: instantiates `useLiveTelemetry` and `useAutomationMonitor`, exposes a large `GrowMonitorState` interface, and is shared with tab descendants via `provideGrowMonitorState` / `useProvidedGrowMonitorState` using an `InjectionKey`. Tabs inject it instead of re-fetching.

**`useAutomationMonitor`:**

- Purpose: turn raw `AutomationRule[]` into display-ready groups with live proximity states.
- Location: `src/composables/useAutomationMonitor.ts`
- Pattern: takes getter callbacks (`getActivePhaseId`, `getReadings`, `getActiveEnv`, `getDevices`) so it stays decoupled from any specific store; computes `ProximityState` (`safe` / `approaching` / `firing` / `unknown` / `unset` / `not-applicable`) by comparing current readings against phase-environment thresholds. Rule toggles are optimistic with rollback.

**`useEnvRuleCoverage`:**

- Purpose: compute which temperature/humidity/CO₂ min/max boundaries are set but uncovered by a matching rule, and which are blocked by a conflicting device automation mode.
- Location: `src/composables/useEnvRuleCoverage.ts`
- Pattern: pure `computeBoundaryCoverage()` plus a `useEnvRuleCoverage()` wrapper returning a `ComputedRef<EnvRuleCoverage>`; used by `PhaseAutomationRulesDialog.vue` to flag coverage gaps.

**`useUnsavedGuard`:**

- Purpose: block in-app navigation and warn on tab close when a form is dirty.
- Location: `src/composables/useUnsavedGuard.ts`
- Pattern: takes a `Ref<boolean>`; hooks `onBeforeRouteLeave` with a PrimeVue confirm dialog and syncs a `beforeunload` listener. Defers the initial dirty read to `onMounted` to avoid TDZ on refs declared later.

## Entry Points

**App bootstrap:**

- Location: `src/main.ts`
- Triggers: browser loads `index.html` → `main.ts`.
- Responsibilities: build `AppPreset`, `createApp(App)`, register Pinia/Router/PrimeVue/Toast/ConfirmationService, add `.app-dark`, mount to `#app`.

**Grow Monitor mount:**

- Location: `src/views/grow-monitor/GrowMonitorView.vue`
- Triggers: navigation to `/grow/:id`.
- Responsibilities: build + provide `GrowMonitorState`, own all sockets/pollers (telemetry, device polling, stale-check, wall-clock ticks), run `reconcileGrowState`, render the status hero + tabbed interface, drive phase skip/end/extend confirmations.

## Error Handling

**Strategy:** normalize through `extractApiError()` (`src/utils/errors.ts`), surface to the user via PrimeVue toasts, revert optimistic state on failure.

- `extractApiError(error, fallback)` returns `{ status, message }` from Axios errors (reads `response.data.error`), generic `Error`s, or the fallback string — used by every error path.
- Optimistic-rollback: `useAutomationMonitor.toggleRule` and `useGrowMonitorState.onDeviceToggle` revert local state when the server call fails or the socket ack is negative.
- Destructive operations (delete controller/grow/device, skip phase, end grow) require a PrimeVue `confirm.require` dialog before executing.
- Conflict handling: grow-cycle activation 409 → "Controller busy" toast (`GrowMonitorView.vue`); camera stream-name 409 → typed `CameraConflictError` (`src/stores/cameraStore.ts`).
- Non-critical polling errors (device poll, telemetry seed) are swallowed with empty `catch` blocks to avoid toast spam during transient network loss.
- `useCameraStore` carries an `error` ref per store so views can display store-level error strings alongside toasts.

## Cross-Cutting Concerns

**Theming:** PrimeVue Aura preset overridden inline in `src/main.ts` — green primary palette, dark-only surface palette, per-component token overrides (button, card, datatable, dialog, inputs). `darkModeSelector: '.app-dark'` is applied at boot; there is no light-mode toggle. Design tokens (spacing, radii, typography, z-index) live in `src/assets/design-tokens.css`; base styles in `src/assets/base.css`; route/transition animations in `src/assets/transitions.css`.

**Realtime:** Socket.IO connections target `new URL(API_BASE).origin` with `transports: ['websocket', 'polling']` and reconnection enabled. Two independent connections exist: a global one in `useDevicePresence` (started from `App.vue`) and a per-monitor one in `useLiveTelemetry` (started from `GrowMonitorView`). Both tear down on unmount (`removeAllListeners` + `disconnect`). REST polling backs up every socket: devices 15 s, telemetry seed 30 s, stale-device-state check 15 s.

**Caching / State Coherence:** Store state is in-memory Pinia refs only — no `localStorage`/`sessionStorage` persistence. Fetches merge by id rather than replacing arrays, so locally-added fields (e.g. a full controller record fetched to supplement a list-item summary) survive re-fetches. The grow-cycle list merge preserves an existing `controller` object if it already carries an `id`.

**Storage:** Backend is the sole source of truth. The `.env` file (gitignored) provides `VITE_API_BASE_URL`, read once in `src/stores/apiBase.ts` with a LAN default fallback.

**HTTP:** All requests go through Axios against `API_BASE`. There is no shared Axios instance or interceptor layer — each store method calls `axios` directly and handles its own errors.

**Quality Gates:** `lefthook.yml` runs oxlint (fix) + oxfmt (write) + tsgo/vue-tsc type-check on pre-commit, and lint + type-check + full build on pre-push. Scripts in `package.json`: `lint`, `format`, `type-check` (`vue-tsc --build`), `type-check:fast` (`tsgo`), `test` (`vitest run`), `quality` (lint + format:check + fast type-check).
