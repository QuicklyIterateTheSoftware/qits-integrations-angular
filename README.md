# @qits/angular

The integration library for Angular apps managed by [qits](https://github.com/wohlben/qits) —
a tool that runs each git branch as a containerized workspace with dev-server daemons, telemetry,
a web view, and a coding agent. Instead of copy-pasting integration files from a fixture repo,
an app takes this library as a dependency.

The library packages the SPA half of the qits observability convention
([spa-observability](https://github.com/wohlben/qits/blob/main/docs/features/2026-07-06_spa-observability.md),
[meta-enrichment](https://github.com/wohlben/qits/blob/main/docs/features/2026-07-11_spa-telemetry-meta-enrichment.md)).
When the backend's identity relay reports a telemetry target, the app exports OTLP protobuf
traces + logs through its own backend's passthrough:

- document-load + fetch spans (client spans with `traceparent` propagation into the backend trace);
- `Navigation` spans and `app.route.path`/`app.route.url` stamped on **every** span and log record;
- click/submit interaction spans, named by a `data-track-event` DOM attribute;
- `code.*` caller attribution on fetch spans (which file/method issued the request);
- uncaught errors shipped as ERROR-severity log records via a provided Angular `ErrorHandler`.

Everything is gated by the backend's `api/config.json` relay: an app whose backend reports no
telemetry target gets `telemetry: null` and the library stays **dark** — no SDK objects constructed,
`window.fetch` untouched, inert dead weight. There is no build-time configuration; the config relay
is the only runtime channel.

That is the standalone case today and also the qits case: qits currently injects no
`OTEL_EXPORTER_OTLP_ENDPOINT` into the services it launches, so a workspace's dev server has no
telemetry target to report. This library needs no change when that comes back — the relay is the
only thing it reads.

The library also ships **feature capture** (`withFeatureCapture()`): a floaty button that
snapshots the running app — the rendered DOM with effective styles frozen inline, route, viewport
metadata — POSTs it to qits' capture ingest, and lands the user in a freshly created qits
workspace whose goal carries the captured context. Gated by the relay's `capture` section, same
dark-by-default stance. **State snapshots** ride along: state the app registers (one line per
`@ngrx/signals` store via `withQitsSnapshot`, or `registerCaptureState` for anything else) lands
in the capture's goal as JSON — what the app *knew*, not just what it rendered.

## Install

Distribution is **git-only, no npm registry** (prototype phase). Consumers install from a commit:

```bash
pnpm add "git+https://github.com/QuicklyIterateTheSoftware/qits-integrations-angular.git#<sha>"
```

pnpm clones the repo, installs its devDependencies, runs `prepare` (which builds `dist/`), then
packs using the `files` field.

**Peers:** `@angular/core`, `@angular/router`, and `@ngrx/signals` (^21). The ngrx peer is
required even if you never call `withQitsSnapshot` — the library's single bundle imports it
statically, so it must be resolvable in every consumer.

**Required consumer-side step:** pnpm 10 gates dependency lifecycle scripts, and the git-dep
`prepare` build is *not* auto-exempt (verified against pnpm 10.33.0 — the install fails with
`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` otherwise). Allowlist this package in the **consumer's**
`package.json`:

```json
{ "pnpm": { "onlyBuiltDependencies": ["@qits/angular"] } }
```

(pnpm's error also accepts the same key in `pnpm-workspace.yaml`; the `package.json` form above is
what this repo verified.)

**Zoneless apps:** `@opentelemetry/instrumentation-user-interaction` (a dependency of this
library) declares a hard `zone.js` peer it doesn't actually need in a zoneless app. Mark it
optional in the consumer's `package.json` so the lockfile stays zone-free (a peer-warning
silencer only — the install works without it):

```json
{
  "pnpm": {
    "packageExtensions": {
      "@opentelemetry/instrumentation-user-interaction": {
        "peerDependenciesMeta": { "zone.js": { "optional": true } }
      }
    }
  }
}
```

## Usage

Two lines, and the ordering of the first is load-bearing:

```ts
// main.ts — initQitsIntegration MUST complete before bootstrapApplication: Angular's
// FetchBackend captures window.fetch on first use, so the fetch instrumentation has to patch it
// first for API calls to get client spans and traceparent propagation.
initQitsIntegration()
  .catch(() => undefined)
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
```

```ts
// app.config.ts
providers: [
  provideBrowserGlobalErrorListeners(), // keep the scaffold default: feeds global errors into the ErrorHandler
  provideRouter(routes),
  provideQitsIntegration(),             // ErrorHandler + Navigation spans + app.route.* stamping
  provideHttpClient(withFetch()),       // required: the default XHR backend is invisible to the fetch instrumentation
],
```

Name interactions with a framework-free DOM attribute — put `data-track-event="<name>"` on the
event **target or an ancestor** (a submit event's target is the *form*, so name forms, not their
buttons):

```html
<form data-track-event="save-greeting" (ngSubmit)="submit()">…</form>
```

### Feature capture

```ts
provideQitsIntegration(withFeatureCapture()),
```

renders a fixed bottom-left capture button (bottom-left so it never collides with qits' own
bottom-right floaties when the app runs framed in the qits web view; styling is self-contained).
The button appears only when the config relay reports a `capture` section (below) **and** the
ingest answers an `OPTIONS` availability probe — qits' CORS route replies 204 where the API
exists; a backend without it 404s and an unreachable target throws, both of which keep the
button hidden instead of doomed. Pressing it is
the whole gesture: spinner → document-scoped style freeze → gzip POST to the ingest → on `201`
the **top** window navigates to the created workspace (so a capture from inside the qits web view
lands the qits tab there, not the framed app). On failure: a retry-able toast, the app
undisturbed.

Bring your own trigger with `withFeatureCapture({ renderButton: false })` and the exported
`captureNow(): Promise<{url}>` — it resolves instead of navigating. `maxDomBytes` (default 2 MB
pre-compression) caps the frozen DOM; over it the snapshot truncates depth-first and sets
`dom.truncated`. The freeze core is exported as `freezeDocument()` for reuse.

Where the POST goes: framed under the qits service proxy (`/workspaces/service/{ws}/{svc}/` base) the frame
origin *is* qits, so the button posts same-origin to `/workspaces/api/capture` — the capture ingest
is `qits-workspaces`, and the qits gateway routes `/<segment>/*` verbatim by prefix, so the segment
is part of the address and not something the gateway adds. Everywhere else it uses the relayed
`ingestUrl` verbatim — which must then be **browser-reachable** (deployed apps configure a public
URL).

### State snapshots

A frozen DOM shows the symptom; state shows the cause. Registered state is serialized into the
capture payload's `state` field and rendered as JSON in the workspace goal. For an
`@ngrx/signals` store, one self-registering line:

```ts
export const CartStore = signalStore(
  { providedIn: 'root' },
  withState(initialCart),
  withQitsSnapshot('cart'),   // registers on init, unregisters on destroy
);
```

Only `withState` slices are captured (computeds are derivable and excluded). For everything else
— plain signals, services, anything callable — the escape hatch:

```ts
const unregister = registerCaptureState('session', () => ({ user: auth.user()?.name ?? null }));
```

Suppliers run **lazily at capture time only**: zero cost until the button is pressed, and the
snapshot is of that moment. Captures never fail because of one bad store — a throwing supplier
contributes `{"$error": …}`, and every value passes a JSON-safe sanitizer: depth cap 8
(`"$depth-capped"`), 64 kB per entry (`{"$truncated": true}`), cycles → `"$circular"`,
functions / DOM nodes / class instances / typed arrays → `"$unserializable(<type>)"`, `Map`/`Set`
converted, `Date` → ISO string, `BigInt` → decimal string.

**Redaction is your job.** The library cannot guess what is sensitive — register a projection
instead of the raw state:

```ts
registerCaptureState('profile', () => ({ ...getState(store), token: undefined }));
```

### The backend contract

The library talks only to its own backend, base-relative (so it works at `/` and under the qits
web-view path prefix alike):

- `GET api/config.json` — the identity relay. `{ "telemetry": null }` keeps the library dark;
  `{ "telemetry": { "serviceName": …, "resourceAttributes": … } }` lights it (the browser's
  service name gets a `-browser` suffix). Override the path via
  `initQitsIntegration({ configUrl: … })`. Feature capture reads its own independently-nullable
  section from the same relay: `{ "capture": { "ingestUrl": …, "resourceAttributes": … } }` —
  built from `QITS_CAPTURE_ENDPOINT` under a qits daemon, an `application.properties` value in a
  deployed build; `capture: null` hides the button. The library self-stamps the relayed
  `qits.repository.id`/`qits.workspace.id` into the payload; the ingest fails closed on identity
  it can't resolve.
- `POST api/otel/v1/{traces|logs}` — verbatim OTLP protobuf passthrough to the real collector,
  which is `POST /observability/api/otel/v1/{traces|logs|metrics}` on qits-observability behind
  its gateway segment. That upstream is the backend's `OTEL_EXPORTER_OTLP_ENDPOINT`, not this
  path: the library stays base-relative and carries **no** qits segment, because it addresses the
  app's own backend and not qits.
  (Capture has **no** passthrough: the browser posts straight to qits' CORS-open ingest URL.)

Both resources are small app-side copies for Quarkus backends — see the
[qits integration guide](https://github.com/wohlben/qits/blob/main/docs/guides/quarkus-angular-integration.md)
(Tier 5) for `ConfigResource`/`OtelProxyResource` and the required
`quarkus.otel.traces.suppress-application-uris` property.

### Serving under a path prefix

Apps served under the qits daemon web view get their prefix at runtime. The rebase must run
before any module code, so it stays an inline `index.html` script — the canonical snippet:

```html
<base href="/">
<script>
  (function () {
    var match = location.pathname.match(/^\/daemon\/[^/]+\/[^/]+\//);
    if (match) document.querySelector('base').setAttribute('href', match[0]);
  })();
</script>
```

## Developing against a consumer

Iterate with a local override — **never churn git refs**:

```bash
pnpm add "file:../qits-integrations-angular"       # or: pnpm link ../qits-integrations-angular
```

Commit a `#<sha>` pin in the consumer only when cutting a consumable state.

## Packaging invariants (don't break these)

- **The root `package.json` *is* the package** — a git dependency installs the repo root, so the
  root manifest carries name/`exports`/`files`/`prepare`/peers, not the workspace-shell defaults.
- **`files: ["dist/qits-integrations-angular"]` carries the build** — anything outside `files` is dropped when
  pnpm packs the git dep.
- **`prepare` builds on consumer install** — `ng build qits-integrations-angular && check-exports`; that second
  run (consumer-side) is the whole distribution mechanism.
- **Root `exports`/`peers` mirror `dist/qits-integrations-angular/package.json`** — ng-packagr writes the
  authoritative manifest there; the consumer never sees it (they install the root), so the root
  must mirror it. `pnpm check-exports` guards the mirror and is wired into `prepare`.

## Regression check (smoke the git install)

```bash
pnpm dlx @angular/cli@21 new smoke --minimal --skip-git --defaults && cd smoke
pnpm add "git+file://$(realpath ../qits-integrations-angular)#main"   # local git URL
pnpm ng build                                            # compiles against installed dist types
pnpm remove @qits/angular
pnpm add "git+https://github.com/QuicklyIterateTheSoftware/qits-integrations-angular.git#<sha>"   # real remote, SHA-pinned
pnpm ng build
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm build` | `ng build qits-integrations-angular` → APF output in `dist/qits-integrations-angular/` |
| `pnpm test` | `ng test qits-integrations-angular` (vitest builder, jsdom) |
| `pnpm test:browser` | `*.browser.spec.ts` in headless Chromium (style freezing needs a real layout engine); needs a one-time `pnpm exec playwright install chromium` |
| `pnpm lint` | `ng lint qits-integrations-angular` |
| `pnpm check-exports` | verify root manifest mirrors `dist/qits-integrations-angular/package.json` |
