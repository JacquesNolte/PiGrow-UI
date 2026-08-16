# Codebase Structure

## Directory Layout

```
PiGrow-UI/
├── design-system/          # Design-system reference docs (pigrow/MASTER.md)
├── docs/                   # Process artifacts (superpowers specs/plans)
├── public/                 # Static assets served as-is (favicon, logos)
├── src/
│   ├── assets/             # CSS — design tokens, base, transitions, main entry
│   ├── components/         # Shared presentational, dialog, chart, diagram components
│   ├── composables/        # Reusable reactive logic (realtime, guards, derived state)
│   ├── data/               # Static reference data (GPIO pinout)
│   ├── stores/             # Pinia stores — apiStore facade + 12 domain stores
│   ├── types/              # Domain model (single grow.ts)
│   ├── utils/              # Pure functions — dates, validation, display, defaults
│   ├── views/              # Page-level components
│   │   ├── admin/          # Admin CRUD views (controller, grow, nutrients, scan)
│   │   └── grow-monitor/   # Live monitor shell + tabs + dialogs + state orchestrator
│   ├── App.vue             # Root component (shell, nav, global toast, presence socket)
│   ├── main.ts             # Bootstrap (plugins, theme preset, mount)
│   ├── router.ts           # Route table
│   └── env.d.ts            # Vite env + .vue SFC type shim
├── API.md                  # Backend API reference (prose)
├── API-ENDPOINTS.md        # Backend endpoint summary
├── index.html              # HTML entry
├── openapi.json            # Backend OpenAPI spec
├── package.json            # Scripts + dependencies
├── vite.config.ts          # Vite config (@ alias → ./src, vue + devtools plugins)
├── vitest.config.ts        # Vitest config
├── tsconfig.json           # TS project references root
├── tsconfig.app.json       # App TS config
├── tsconfig.node.json      # Node-side TS config
├── lefthook.yml            # Git hooks (lint/format/type-check/build)
├── .oxlintrc.json          # oxlint config
├── .oxfmtrc.json           # oxfmt config
├── .prettierrc.json        # Prettier config
└── README.md               # Project overview + setup
```

## Directory Purposes

**`src/stores/`:**

- Purpose: all Pinia state and backend communication.
- Contains: `apiStore.ts` (the facade every consumer imports), `apiBase.ts` (the single `API_BASE` constant), and one store per domain entity.
- Key files: `src/stores/apiStore.ts`, `src/stores/deviceStore.ts`, `src/stores/growCycleStore.ts`, `src/stores/controllerStore.ts`, `src/stores/growPhaseStore.ts`, `src/stores/cameraStore.ts`.

**`src/composables/`:**

- Purpose: reactive logic shared across views — realtime connections, derived display state, form guards.
- Contains: `useLiveTelemetry.ts` (Socket.IO telemetry + REST fallback), `useDevicePresence.ts` (global device-state socket), `useAutomationMonitor.ts` (rule display + proximity), `useEnvRuleCoverage.ts` (env/rule coverage analysis), `useUnsavedGuard.ts` (navigation guard).
- Key files: `src/composables/useLiveTelemetry.ts`, `src/composables/useAutomationMonitor.ts`.

**`src/views/grow-monitor/`:**

- Purpose: the live monitoring dashboard — a shell that owns sockets/pollers and tab views that inject shared state.
- Contains: `GrowMonitorView.vue` (shell + hero + tabs + reconciliation), `useGrowMonitorState.ts` (orchestrator, provided via injection key), tab views (`OverviewTab.vue`, `HistoryTab.vue`, `PlanTab.vue`, `NutrientsTab.vue`, `LiveFeedTab.vue`, `NotesTab.vue`), dialogs (`ExtendPhaseDialog.vue`, `GrowNoteDialog.vue`, `CameraFormDialog.vue`), and supporting views (`CameraTile.vue`, `DosingLogHistory.vue`, `SnapshotGallery.vue`).
- Key files: `src/views/grow-monitor/useGrowMonitorState.ts`, `src/views/grow-monitor/GrowMonitorView.vue`, `src/views/grow-monitor/OverviewTab.vue`.

**`src/views/admin/`:**

- Purpose: admin CRUD for controllers, grows, and nutrients.
- Contains: `ControllerFormView.vue` (create/edit controller + devices + sensors), `GrowFormView.vue` (create/edit grow cycle + phases + environments + automation rules), `ScanControllersView.vue` (zero-touch scan + claim), `Nutrients.vue` (nutrient CRUD).
- Key files: `src/views/admin/GrowFormView.vue`, `src/views/admin/ControllerFormView.vue`, `src/views/admin/ScanControllersView.vue`.

**`src/components/`:**

- Purpose: reusable presentational components, dialogs, charts, and diagrams.
- Contains: charts (`TelemetryChart.vue`, `DeviceHistoryChart.vue`), diagrams (`GpioPinoutDiagram.vue`, `WiringDiagram.vue`), and phase/dosing form pieces (`PhaseRuleForm.vue`, `PhaseAutomationRulesDialog.vue`, `PhaseNutrientList.vue`, `PhasePhBandEditor.vue`, `NutrientList.vue`, `DosingLogForm.vue`, `DosingCalculatorDialog.vue`).
- Key files: `src/components/TelemetryChart.vue`, `src/components/PhaseRuleForm.vue`, `src/components/GpioPinoutDiagram.vue`.

**`src/utils/`:**

- Purpose: pure, framework-free functions.
- Contains: `growDates.ts` (phase/progress date math), `growAutomationDefaults.ts` (default rule specs per device type), `growPhaseDefaults.ts`, `automationRuleValidation.ts`, `automationRuleDisplay.ts`, `sensors.ts`, `errors.ts` (`extractApiError`), `chartTimeAxis.ts`, `dosingWarnings.ts`, `snapshotFormat.ts`, `wiring.ts`, `testStub.ts` (test fixtures).
- Key files: `src/utils/growDates.ts`, `src/utils/errors.ts`, `src/utils/automationRuleValidation.ts`.

**`src/types/`:**

- Purpose: the domain model.
- Contains: `grow.ts` — all enums and entity interfaces for the entire app.
- Key files: `src/types/grow.ts`.

**`src/data/`:**

- Purpose: static reference data not fetched from the backend.
- Contains: `gpio-pins.ts` — the Raspberry Pi 40-pin GPIO pinout.
- Key files: `src/data/gpio-pins.ts`.

**`src/assets/`:**

- Purpose: global CSS.
- Contains: `design-tokens.css` (spacing, radii, typography, color, z-index custom properties), `base.css` (resets/element defaults), `transitions.css` (route/animation keyframes), `main.css` (import entry loaded by `main.ts`).

## Key File Locations

**Entry Points:** `src/main.ts` (bootstrap + theme preset), `src/App.vue` (root shell + global presence socket), `index.html` (HTML entry).
**Configuration:** `vite.config.ts` (Vite + `@` alias), `tsconfig.app.json` (app TS), `lefthook.yml` (git hooks), `package.json` (scripts).
**Core Logic:** `src/stores/apiStore.ts` (facade), `src/views/grow-monitor/useGrowMonitorState.ts` (monitor orchestrator), `src/composables/useLiveTelemetry.ts` (realtime), `src/utils/growDates.ts` (phase math).
**Domain Model:** `src/types/grow.ts`.
**Routing:** `src/router.ts`.
**API Reference:** `API.md`, `API-ENDPOINTS.md`, `openapi.json` (backend contract).
**Tests:** co-located with source as `*.test.ts` (e.g. `src/composables/useLiveTelemetry.test.ts`, `src/views/grow-monitor/NotesTab.test.ts`).

## Naming Conventions

**Vue components / views:** PascalCase, `.vue` — `GrowMonitorView.vue`, `TelemetryChart.vue`, `PhaseRuleForm.vue`. Page views use a `View` suffix; tabs use a `Tab` suffix; dialogs use a `Dialog` suffix.

**Composables:** `use<PascalCase>.ts` — `useLiveTelemetry.ts`, `useAutomationMonitor.ts`.

**Stores:** `<camelCase>Store.ts` — `deviceStore.ts`, `growCycleStore.ts`. The facade is `apiStore.ts`; the base URL lives in `apiBase.ts`.

**Utilities / types:** camelCase `.ts` — `growDates.ts`, `automationRuleValidation.ts`, `grow.ts`.

**Static data:** kebab-case `.ts` — `gpio-pins.ts`.

**Tests:** co-located, same stem as the unit under test with a `.test.ts` suffix — `DosingLogForm.test.ts`, `useAutomationMonitor.test.ts`.

**Routes:** `name` is kebab-case (`controller-create`, `grow-monitor`); `path` mirrors the name with params (`/admin/controllers/edit/:id`, `/grow/:id`).

## Where to Add New Code

**New backend resource / domain store:** create `src/stores/<name>Store.ts` (setup-style, `defineStore`, Axios against `API_BASE`), then surface its methods and state through `src/stores/apiStore.ts` so views consume it via the facade.

**New page view:** create `src/views/<Name>View.vue` and add a route to `src/router.ts`. Admin pages go under `src/views/admin/`.

**New grow-monitor tab:** create `src/views/grow-monitor/<Name>Tab.vue`, load it (eagerly or via `defineAsyncComponent`) in `src/views/grow-monitor/GrowMonitorView.vue`, add a `<Tab>`/`<TabPanel>` entry, and read shared state via `useProvidedGrowMonitorState()` — do not re-fetch data the orchestrator already owns.

**New shared component:** `src/components/<Name>.vue`.

**New composable:** `src/composables/use<Name>.ts`. If it opens a Socket.IO connection, follow the `useLiveTelemetry` pattern: `start`/`stop`, `onUnmounted(stop)`, and `removeAllListeners` + `disconnect`.

**New domain entity or enum:** add to `src/types/grow.ts` — the model stays in one file.

**New pure utility:** `src/utils/<name>.ts`.

**New static reference data:** `src/data/<name>.ts`.

**Tests:** co-locate as `<stem>.test.ts` next to the source file; use `src/utils/testStub.ts` for shared fixtures.
