import { SeverityNumber } from '@opentelemetry/api-logs';
import { TelemetryErrorHandler, setErrorLogger } from './telemetry-error-handler';

describe('TelemetryErrorHandler', () => {
  beforeEach(() => {
    // super.handleError logs to the console; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setErrorLogger(undefined);
    vi.restoreAllMocks();
  });

  it('ships errors as ERROR-severity log records with exception.* attributes', () => {
    const emit = vi.fn();
    setErrorLogger({ emit } as never);

    new TelemetryErrorHandler().handleError(new RangeError('boom'));

    expect(emit).toHaveBeenCalledWith({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'boom',
      attributes: {
        'exception.type': 'RangeError',
        'exception.message': 'boom',
        'exception.stacktrace': expect.stringContaining('boom'),
      },
    });
    expect(console.error).toHaveBeenCalled(); // still defers to Angular's default logging
  });

  it('wraps non-Error throwables before emitting', () => {
    const emit = vi.fn();
    setErrorLogger({ emit } as never);

    new TelemetryErrorHandler().handleError('plain string failure');

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'plain string failure',
        attributes: expect.objectContaining({ 'exception.type': 'Error' }),
      }),
    );
  });

  it('is console-only while telemetry is dark (no logger set)', () => {
    expect(() => new TelemetryErrorHandler().handleError(new Error('dark'))).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});
