import {
  ErrorHandler,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { provideRouteTelemetry } from './route-telemetry';
import { TelemetryErrorHandler } from './telemetry-error-handler';

/**
 * A tree-shakable add-on to provideQitsIntegration, mirroring provideHttpClient(withFetch()):
 * the base call stays telemetry-only and later features (feature capture, state snapshots) ship
 * as with*() functions returning one of these instead of options that bloat every consumer.
 */
export interface QitsIntegrationFeature {
  providers: (Provider | EnvironmentProviders)[];
}

/**
 * DI wiring of the qits integration: the TelemetryErrorHandler (uncaught errors as ERROR-severity
 * OTLP log records) and route telemetry (Navigation spans + app.route.* stamping on every
 * span/log record). Everything is a no-op while telemetry is dark (no relay in api/config.json).
 *
 * Pair with `await initQitsIntegration()` in main.ts BEFORE bootstrapApplication — Angular's
 * FetchBackend captures window.fetch on first use, so the fetch instrumentation must patch it
 * first. The app must also keep `provideHttpClient(withFetch())` (the default XHR backend is
 * invisible to the fetch instrumentation: no client spans, no traceparent) and the scaffold's
 * `provideBrowserGlobalErrorListeners()` (it funnels genuinely-global errors and unhandled
 * rejections into the ErrorHandler provided here).
 */
export function provideQitsIntegration(
  ...features: QitsIntegrationFeature[]
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ErrorHandler, useClass: TelemetryErrorHandler },
    provideRouteTelemetry(),
    ...features.flatMap((feature) => feature.providers),
  ]);
}
