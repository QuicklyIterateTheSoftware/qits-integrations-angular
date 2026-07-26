import { ErrorHandler, Injectable } from '@angular/core';
import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';

// Set by initQitsIntegration once telemetry is lit; undefined keeps the handler console-only.
let errorLogger: Logger | undefined;

export function setErrorLogger(logger: Logger | undefined): void {
  errorLogger = logger;
}

/**
 * Ships uncaught errors as ERROR-severity OTLP log records (surfacing them in the qits errors feed
 * and telemetryErrors MCP tool), then defers to Angular's default console logging.
 *
 * ErrorHandler is the one funnel that sees everything in a zoneless app: zoneless Angular catches
 * event-handler exceptions before they ever reach window's error event, and
 * provideBrowserGlobalErrorListeners forwards genuinely-global errors and unhandled rejections
 * here too.
 */
@Injectable()
export class TelemetryErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (errorLogger) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorLogger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: err.message,
        attributes: {
          'exception.type': err.name,
          'exception.message': err.message,
          'exception.stacktrace': err.stack ?? '',
        },
      });
    }
    super.handleError(error);
  }
}
