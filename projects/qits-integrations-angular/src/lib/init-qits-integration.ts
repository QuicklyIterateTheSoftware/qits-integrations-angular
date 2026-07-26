import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { resetCaptureForTesting, setCaptureRelay } from './capture-config';
import { installFetchCallerAttribution } from './fetch-caller-attribution';
import { enrichInteractionSpan } from './interaction-telemetry';
import { RouteStampingLogRecordProcessor, RouteStampingSpanProcessor } from './route-context';
import { setErrorLogger } from './telemetry-error-handler';

export interface QitsIntegrationOptions {
  /** Where to fetch the identity relay; default 'api/config.json' (base-relative). */
  configUrl?: string;
}

interface TelemetryRelay {
  resourceAttributes: Record<string, string>;
  serviceName: string;
}

let initialized = false;
let telemetryActive = false;

/** Whether initQitsIntegration found a telemetry relay and lit the SDKs. */
export function isTelemetryActive(): boolean {
  return telemetryActive;
}

// The proto exporters POST via fetch() — FetchInstrumentation must exclude them or every export
// spawns a span exporting itself, forever.
export const OTLP_PASSTHROUGH_URL_PATTERN = /\/api\/otel\/v1\//;

// The exporters use a user-provided url verbatim (no /v1/<signal> appended) and resolve it
// against location.href, not <base> — so build absolute per-signal URLs from the rebased base.
export function otlpExportUrl(signal: 'traces' | 'logs'): string {
  return new URL(`api/otel/v1/${signal}`, document.baseURI).href;
}

/**
 * Browser telemetry, gated by the backend's identity relay: fetch the base-relative
 * api/config.json and stay dark when it reports `telemetry: null` (app running standalone, or the
 * qits daemon's otel toggle is off). When lit, export OTLP protobuf to the backend's own
 * api/otel/v1/* passthrough — base-relative like every other API call, so it works at `/` and
 * under the qits daemon web-view prefix alike.
 *
 * Must complete before bootstrapApplication: Angular's FetchBackend captures window.fetch when it
 * is first used, so the fetch instrumentation has to patch it first for the app's API calls to
 * get client spans and traceparent propagation. The documented main.ts contract:
 *
 * ```ts
 * initQitsIntegration()
 *   .catch(() => undefined)
 *   .then(() => bootstrapApplication(App, appConfig))
 *   .catch((err) => console.error(err));
 * ```
 */
export async function initQitsIntegration(options?: QitsIntegrationOptions): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  let relay: TelemetryRelay | null;
  try {
    const configUrl = options?.configUrl ?? 'api/config.json';
    const response = await fetch(new URL(configUrl, document.baseURI).href);
    if (!response.ok) {
      return;
    }
    const config = await response.json();
    // Independently nullable sections: capture can be lit while telemetry is dark (and vice
    // versa), so stash it before the telemetry gate below.
    setCaptureRelay(config.capture ?? null);
    relay = config.telemetry ?? null;
  } catch {
    return; // telemetry is best-effort; never block the app
  }
  if (!relay) {
    return;
  }
  telemetryActive = true;

  const resource = resourceFromAttributes({
    ...relay.resourceAttributes,
    // The distinct service name is what makes the qits log-tail service filter useful.
    'service.name': `${relay.serviceName}-browser`,
  });

  // Flush every second, not the default five: the qits web view is an iframe, and removing an
  // iframe (closing the floaty) fires no pagehide/visibilitychange — anything still buffered is
  // lost. A short interval shrinks that window to <=1s; dev traffic is tiny, so it costs nothing.
  const flush = { scheduledDelayMillis: 1000 };

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new RouteStampingSpanProcessor(),
      new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpExportUrl('traces') }), flush),
    ],
  });
  // Defaults: StackContextManager (zoneless apps) + W3C trace-context/baggage propagators.
  tracerProvider.register();

  // Before FetchInstrumentation patches fetch, so its patch wraps the wrapper — see the function.
  installFetchCallerAttribution();

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({ ignoreUrls: [OTLP_PASSTHROUGH_URL_PATTERN] }),
      // Clicks/submits become spans; synchronous work in the handler (zoneless apps use the
      // stack context manager) nests under them, so a submit-fired POST gets the interaction as
      // its trace root. Work behind an await/setTimeout escapes — accepted, no zone.js shipped.
      new UserInteractionInstrumentation({
        eventNames: ['click', 'submit'],
        shouldPreventSpanCreation: (_eventName, element, span) =>
          enrichInteractionSpan(element, span),
      }),
    ],
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new RouteStampingLogRecordProcessor(),
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: otlpExportUrl('logs') }),
        ...flush,
      }),
    ],
  });
  setErrorLogger(loggerProvider.getLogger('browser-errors'));
  // No extra flush wiring: both batch processors also auto-flush on document hide by default
  // (tab switches); the short interval above covers iframe removal, which hides nothing.
}

/** Test seam: the module-level init guard would otherwise leak across specs. */
export function resetQitsIntegrationForTesting(): void {
  initialized = false;
  telemetryActive = false;
  setErrorLogger(undefined);
  resetCaptureForTesting();
}
