import { trace } from '@opentelemetry/api';

/**
 * Caller attribution on fetch spans (stable code.* semconv): "which file/method issued this
 * request". Installed before FetchInstrumentation registers, so the instrumentation's patch wraps
 * this wrapper and runs it inside the just-started fetch span's context — trace.getActiveSpan()
 * here IS the fetch span. The OTLP export URLs are excluded by ignoreUrls (no span) and fire from
 * batch timers (no ambient span either): the wrapper is self-excluding.
 *
 * Resolution honesty: under a dev server the function name (Greeting.submit) is the reliable
 * signal; file "paths" are served-bundle URLs. The capped code.stacktrace compensates.
 */
export function installFetchCallerAttribution(): void {
  const originalFetch = window.fetch;
  window.fetch = function attributedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    const span = trace.getActiveSpan();
    if (span?.isRecording()) {
      const frames = applicationFrames(captureStack());
      const top = frames.length > 0 ? parseFrame(frames[0]) : undefined;
      if (top) {
        span.setAttributes({
          'code.function.name': top.functionName,
          'code.file.path': top.file,
          'code.line.number': top.line,
          // Cap at 10 frames: telemetry rows are read in a narrow drill-down pane.
          'code.stacktrace': frames.slice(0, 10).join('\n'),
        });
      }
    }
    return originalFetch.apply(this, args);
  };
}

// V8 caps stacks at 10 frames by default — the RxJS/HttpClient plumbing between a component
// method and window.fetch alone is ~50 frames deep (measured under ng serve), so lift the limit
// around the capture or the app's caller never even makes it into the raw stack.
function captureStack(): string {
  const limits = Error as unknown as { stackTraceLimit?: number };
  const previous = limits.stackTraceLimit;
  limits.stackTraceLimit = Infinity;
  const stack = new Error().stack ?? '';
  limits.stackTraceLimit = previous;
  return stack;
}

// Frames to drop so the topmost survivor is the app's caller: this wrapper, OTEL internals,
// dev-served dependency chunks (Angular's vite dev server serves them under /@fs/…/vite/deps/),
// and the RxJS/HttpClient plumbing between a subscribe call and window.fetch. The name
// alternatives tolerate esbuild's decorations (_FetchBackend, Observable2). Tuned against a live
// `ng serve` stack.
const VENDOR_FRAME =
  /captureStack|attributedFetch|@opentelemetry|node_modules|\/@fs\/|[/.]vite\/|zone\.js|polyfills|\bat _?(Observable|Subscriber|SafeSubscriber|ConsumerObserver|OperatorSubscriber|Subject|BehaviorSubject|FetchBackend|HttpInterceptorHandler|HttpClient|NoopNgZone)\d*[.\s]/;

export function applicationFrames(stack: string): string[] {
  return stack
    .split('\n')
    .slice(1)
    .filter((line) => !VENDOR_FRAME.test(line));
}

export function parseFrame(
  line: string,
): { functionName: string; file: string; line: number } | undefined {
  // V8: "    at Greeting.submit (http://host/main.js:12:34)" or "    at http://host/main.js:12:34"
  const named = /^\s*at (.+?) \((.+):(\d+):\d+\)$/.exec(line);
  if (named) {
    // esbuild's dev bundling aliases classes with a leading underscore (_Greeting.submit) — strip
    // it so the attribute reads like the source.
    return { functionName: named[1].replace(/^_+/, ''), file: named[2], line: Number(named[3]) };
  }
  const anon = /^\s*at (.+):(\d+):\d+$/.exec(line);
  return anon ? { functionName: '<anonymous>', file: anon[1], line: Number(anon[2]) } : undefined;
}
