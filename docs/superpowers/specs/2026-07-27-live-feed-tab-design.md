# Live Feed Tab — FE Implementation Spec

**Date:** 2026-07-27
**Status:** Approved (FE exploration complete; backend cameras API built)
**Scope:** Add a "Live Feed" tab to the grow-monitor page rendering RTSP camera streams via a go2rtc WebRTC iframe, with full camera CRUD inside the tab.
**Repo:** `PiGrow-UI` (Vue 3 + Vite + PrimeVue + Pinia + axios + vitest). Backend: PiGrow-Server `cameras` API (already implemented, uncommitted).

## Goal

Add a **Live Feed** tab to the grow-monitor page (`/grow/:id`) showing WebRTC live streams from the cameras associated with that grow's controller, with an embedded go2rtc player per camera, a snapshot placeholder while each stream connects, and a full add/edit/delete camera UI for the empty state and ongoing management.

## Decisions (locked)

- **Which cameras:** only cameras whose `controllerId` matches the controller of the active grow cycle on this page ("this grow's cameras"). Others are not shown.
- **Empty state:** an "Add Camera" affordance with a full add/edit/delete form inside the tab (camera CRUD lives here, not in a separate settings page).
- **Snapshot use:** a still-frame snapshot (go2rtc `/api/frame.jpeg`) as a loading placeholder before the WebRTC iframe connects; the iframe takes over once loaded. No manual refresh button, no snapshot-only mode.

## 1. Tab placement (mechanical)

`src/views/grow-monitor/GrowMonitorView.vue` already has a PrimeVue `Tabs` with `overview`/`history`/`plan`/`nutrients` (declared at lines 433-480; `activeTab` ref at line 65).

- **Add the async import** alongside the other `defineAsyncComponent` calls (lines 33-35):
  ```ts
  const LiveFeedTab = defineAsyncComponent(() => import('./LiveFeedTab.vue'))
  ```
- **Add the Tab trigger** in `<TabList>` (after Nutrients):
  ```vue
  <Tab value="live-feed"><i class="pi pi-video" /><span>Live Feed</span></Tab>
  ```
- **Add the TabPanel** in `<TabPanels>`:
  ```vue
  <TabPanel value="live-feed"><LiveFeedTab /></TabPanel>
  ```
- **Update the `activeTab` type** (line 65) to include `'live-feed'`.

The parent `<Tabs lazy>` already lazy-mounts panels, so the iframe/component only mounts when the tab is selected — no wasted streams while other tabs are open.

## 2. Data model (types)

`src/types/grow.ts` — add the `Camera` type matching the **backend DTO** (not the Prisma model — the DTO never carries `rtspUrl`/`rtspUrlCipher`):

```ts
export interface Camera {
  id: string
  name: string
  streamName: string
  controllerId: string | null
  webrtcUrl: string // derived by backend from GO2RTC_HOST
  snapshotUrl: string // derived by backend from GO2RTC_HOST
  warnings: string[] // e.g. ['GO2RTC_UNREACHABLE']
  createdAt: string
  updatedAt: string
}

export interface CreateCameraPayload {
  name: string
  streamName: string
  rtspUrl: string
  controllerId?: string | null
}

export interface UpdateCameraPayload {
  name?: string
  streamName?: string
  rtspUrl?: string
  controllerId?: string | null
}
```

**URL source:** use the backend-derived `webrtcUrl`/`snapshotUrl` from the DTO. Do NOT reconstruct them in the FE and do NOT add a `VITE_GO2RTC_HOST` env var — the backend's `GO2RTC_HOST` is the single source of truth for the go2rtc host. The backend `GO2RTC_HOST` must be the browser-reachable LAN IP (e.g. `http://192.168.0.105:8555`), not `localhost` — confirm in PiGrow-Server `.env` before testing end-to-end.

## 3. API client layer (Pinia store)

New `src/stores/cameraStore.ts`, mirroring `src/stores/growCycleStore.ts` exactly:

- `defineStore('camera', () => { ... })` with `ref<Camera[]>([])` state, `ref<boolean>` loading, `ref<string | null>` error.
- `API_BASE` from `src/stores/apiBase.ts` (`import.meta.env.VITE_API_BASE_URL || 'http://192.168.0.105:4000/api'`).
- Methods (all `axios` against `${API_BASE}/cameras`):
  - `list()` → `GET /cameras` → sets `cameras.value`.
  - `create(payload)` → `POST /cameras` → pushes the returned `Camera` into `cameras.value`; on 409 rethrows a typed conflict error so the form can map it to a field error (see §6).
  - `update(id, payload)` → `PATCH /cameras/:id` → replaces the matching entry in `cameras.value`.
  - `remove(id)` → `DELETE /cameras/:id` → removes from `cameras.value`.
- Each method handles axios errors → sets `error.value`; rethrows so the component can surface a toast. No silent swallowing.
- Register in `src/stores/apiStore.ts` alongside the other stores; expose `cameras: { list, create, update, remove }` and the reactive `cameras` ref in the return object, matching how other stores are surfaced.

## 4. `LiveFeedTab.vue` (the tab)

**Location:** `src/views/grow-monitor/LiveFeedTab.vue`.

**State source:** consume `useProvidedGrowMonitorState()` (same pattern as `HistoryTab.vue`) to get this grow's controller id. Confirm the exact field name on the state during implementation — the mapper shows tabs read `state.cycleId.value`; the controller id is the filter key (follow the same chain the Overview tab uses to resolve controller from the active cycle).

**On mount:** `cameraStore.list()` once. Don't refetch on every tab switch — the store holds the list; the tab filters it.

**Filtered list (computed):**

```ts
const growCameras = computed(() =>
  cameraStore.cameras.value.filter((c) => c.controllerId === state.controllerId.value),
)
```

This realizes the "this grow's cameras" decision.

**Template structure:**

```vue
<div class="live-feed-tab">
  <div class="header">
    <h3>Live Feed</h3>
    <Button label="Add Camera" icon="pi pi-plus" @click="openAddForm" />
  </div>

  <Card v-if="growCameras.length === 0">
    <template #content>
      <div class="empty-state">
        <i class="pi pi-video" />
        <p>No cameras for this grow yet.</p>
        <Button label="Add Camera" icon="pi pi-plus" @click="openAddForm" />
      </div>
    </template>
  </Card>

  <div v-else class="camera-grid">
    <CameraTile
      v-for="camera in growCameras"
      :key="camera.id"
      :camera="camera"
      @edit="openEditForm(camera)"
      @delete="confirmDelete(camera)"
    />
  </div>

  <CameraFormDialog
    v-model:visible="formVisible"
    :camera="editingCamera"
    :defaultControllerId="state.controllerId.value"
    @saved="onSaved"
  />
</div>
```

The empty state is inline in the template (no separate `EmptyState` component) — it's a trivial block, matching the house style for simple empty states.

## 5. `CameraTile.vue` (sub-component)

**Location:** `src/views/grow-monitor/CameraTile.vue`. One tile per camera, implementing the snapshot-as-loading-placeholder behavior.

```vue
<div class="camera-tile">
  <div class="tile-header">
    <span class="name">{{ camera.name }}</span>
    <span v-if="camera.warnings.includes('GO2RTC_UNREACHABLE')" class="warning">go2rtc down</span>
    <Button icon="pi pi-pencil" text @click="$emit('edit')" />
    <Button icon="pi pi-trash" text @click="$emit('delete')" />
  </div>
  <div class="tile-body" style="aspect-ratio: 16 / 9">
    <img
      v-if="!streamReady"
      :src="camera.snapshotUrl"
      referrerPolicy="no-referrer"
      class="snapshot-placeholder"
      @error="onSnapshotError"
    />
    <iframe
      v-show="streamReady"
      :src="camera.webrtcUrl"
      :title="camera.name"
      allow="autoplay; encrypted-media"
      class="live-iframe"
      @load="onIframeLoad"
    />
  </div>
</div>
```

**Snapshot → iframe transition logic:**

- `streamReady` starts `false`; the snapshot `<img>` renders first (go2rtc's `/api/frame.jpeg?src=...` is near-instant).
- On the iframe `@load` (go2rtc's `/stream.html` player loaded and began WebRTC negotiation), set `streamReady = true` → the iframe becomes visible (`v-show`), the snapshot `<img>` is removed (`v-if="!streamReady"` drops it from the DOM, freeing the JPEG fetch).
- **Failure fallback (cheap, optional for v1):** if the iframe hasn't fired `@load` within ~8s, assume the stream failed and keep showing the snapshot with a "stream unavailable — showing last snapshot" badge. A simple `setTimeout` toggle. If skipped, the snapshot stays until the iframe loads — acceptable.
- **Warnings display:** if `camera.warnings` includes `'GO2RTC_UNREACHABLE'`, show a "go2rtc down — stream will sync when it returns" badge. The iframe will fail to load in that state; the snapshot will also fail to load (broken image). The badge is the signal — no special handling needed.

**CORS note:** `<img>` and `<iframe>` are not subject to CORS for display, so go2rtc needs no CORS config for v1 (confirmed by the spike — go2rtc sets no framing headers). `referrerPolicy="no-referrer"` on the `<img>` prevents the browser from sending the dashboard origin as referer to go2rtc.

## 6. `CameraFormDialog.vue` (add/edit)

**Location:** `src/views/grow-monitor/CameraFormDialog.vue`. A PrimeVue `Dialog` with the form.

**Fields:**

- `name` — text, required, maxLength 100.
- `streamName` — text, required, regex `^[a-zA-Z0-9_-]{1,64}$` (the go2rtc stream key). Hint: "letters, numbers, dash, underscore — no spaces".
- `rtspUrl` — text, required on create, must start `rtsp://`. On EDIT: show a placeholder "•••••• leave blank to keep current" and only send `rtspUrl` if the user types a new value. The backend DTO never returns the URL, so the field cannot be prefilled on edit.
- `controllerId` — hidden, defaulting to `defaultControllerId` (this grow's controller, passed as a prop). The new camera is auto-associated with this grow. (A dropdown to reassign is out of scope for v1.)

**On save:**

- Create → `cameraStore.create({ name, streamName, rtspUrl, controllerId: defaultControllerId })`. The store pushes the returned `Camera` into `cameras.value`; the computed filter picks it up immediately → the tile appears.
- Edit → `cameraStore.update(id, payload)` where `payload` includes only changed fields; `rtspUrl` only if the user entered a new one.
- Toast on success via `useToast` from `primevue/usetoast` (same pattern as other tabs). On error, surface the store's `error` ref in a toast.
- Close the dialog, emit `saved`.

**streamName uniqueness:** the backend returns `409` with `{ error: 'CAMERA_STREAM_NAME_CONFLICT', existingId }` on a clash. Catch the 409 in the store method and rethrow a typed error (e.g. `CameraConflictError`) the dialog maps to a field-level error on `streamName`. Do not pre-check via a separate GET — the backend is the authority.

## 7. Delete confirmation

Use PrimeVue `useConfirm` (`primevue/useconfirm`, the pattern other tabs use): "Delete camera 'X'? This removes the stream from go2rtc." → `cameraStore.remove(id)`. The tile disappears from the grid via the computed filter.

## 8. Env / config

- **No new FE env var required** for v1. The FE uses the backend-derived `webrtcUrl`/`snapshotUrl` from the `Camera` DTO. The backend's `GO2RTC_HOST` env (server-side) must be the **browser-reachable** LAN IP (e.g. `http://192.168.0.105:8555`), not `localhost` — confirm in PiGrow-Server `.env`. If it's wrong, the iframe `src` points at an unreachable host and the stream won't load.
- `VITE_API_BASE_URL` already exists in PiGrow-UI `.env` — no change.

## 9. Tests

Follow `src/views/grow-monitor/DosingLogHistory.test.ts`:

- `vi.mock('./useGrowMonitorState', ...)` to stub the provided composable (provide a fake `controllerId`).
- `vi.mock('../../stores/apiStore', ...)` to stub `cameraStore` (control `cameras.value`, `list`, `create`, `update`, `remove`).
- `vi.mock('primevue/usetoast', ...)` and `vi.mock('primevue/useconfirm', ...)`.
- `mount()` with `primeVueStubs` from `src/utils/testStub`.

**`LiveFeedTab.test.ts` cases:**

1. Renders the empty state when no cameras match this controller; the Add Camera button opens the dialog.
2. Renders one `CameraTile` per matching camera; cameras with a different `controllerId` are NOT shown.
3. `cameraStore.list` is called on mount.
4. Add form: filling name/streamName/rtspUrl and saving calls `cameraStore.create` with `controllerId` = this grow's controller; on success the dialog closes and the new tile appears (stub the store to push the returned camera into `cameras.value`).
5. streamName conflict (409): stub `create` to reject with `CameraConflictError`; assert the field-level error shows on `streamName` and the dialog stays open.
6. Delete: confirm dialog → `cameraStore.remove` called with the id; on success the tile is gone.

**`CameraTile.test.ts` cases:**

1. Shows the snapshot `<img>` first; when the iframe `@load` fires, `streamReady` becomes true and the iframe is visible (`v-show`) and the snapshot is removed.
2. Shows the "go2rtc down" badge when `camera.warnings` includes `GO2RTC_UNREACHABLE`.

**Gates:** `npm test` (vitest run) green + `npm run type-check` (`vue-tsc --build`) green + `npm run build` green. `npm run lint`/`format:check` per house quality gates.

## 10. Out of scope (v1)

- Socket.IO live camera-list updates (the store refetches on demand; no camera event is emitted by the backend v1).
- Snapshot-only mode, timelapse, continuous recording (backend v1 doesn't support it).
- WAN/TURN access (LAN only — go2rtc on `8555`, no TURN).
- A separate Camera Management settings page (CRUD lives inside the Live Feed tab per the "empty state + add form" decision).
- Multi-camera batch operations / drag-reorder.
- `VITE_GO2RTC_HOST` override (use the backend-derived DTO URLs).
- Manual refresh-snapshot button (decided against; snapshot is a transient loading placeholder only).

## 11. Files to touch

| File                                          | Action                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/views/grow-monitor/GrowMonitorView.vue`  | Add async import + `<Tab value="live-feed">` + `<TabPanel value="live-feed">`; widen `activeTab` type |
| `src/views/grow-monitor/LiveFeedTab.vue`      | **New** — the tab                                                                                     |
| `src/views/grow-monitor/CameraTile.vue`       | **New** — one stream tile                                                                             |
| `src/views/grow-monitor/CameraFormDialog.vue` | **New** — add/edit dialog                                                                             |
| `src/stores/cameraStore.ts`                   | **New** — Pinia store mirroring `growCycleStore.ts`                                                   |
| `src/stores/apiStore.ts`                      | Register + expose `cameraStore`                                                                       |
| `src/types/grow.ts`                           | Add `Camera` + payload types                                                                          |
| `src/views/grow-monitor/LiveFeedTab.test.ts`  | **New** — tests                                                                                       |
| `src/views/grow-monitor/CameraTile.test.ts`   | **New** — tests                                                                                       |
| (PiGrow-Server) `.env`                        | Confirm `GO2RTC_HOST` is the browser-reachable LAN IP, not `localhost`                                |
