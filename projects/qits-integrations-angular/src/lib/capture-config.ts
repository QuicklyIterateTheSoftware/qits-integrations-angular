/**
 * Capture relay state: written by initQitsIntegration from config.json's `capture` section, read
 * by the capture feature. Module-level like route-context — the relay arrives pre-bootstrap,
 * before DI exists.
 */
export interface CaptureRelay {
  /** qits' open capture ingest URL, relayed verbatim by the backend. */
  ingestUrl: string;
  /** Identity the SPA self-stamps into the payload (qits.repository.id / qits.workspace.id). */
  resourceAttributes: Record<string, string>;
}

export interface CaptureFeatureOptions {
  /** Render the floaty capture button (default true). Off ⇒ trigger via captureNow() yourself. */
  renderButton?: boolean;
  /** Pre-compression cap on the frozen DOM serialization; beyond it the snapshot truncates. */
  maxDomBytes?: number;
}

export const DEFAULT_MAX_DOM_BYTES = 2_000_000;

let relay: CaptureRelay | null = null;
let options: Required<CaptureFeatureOptions> = withDefaults({});

export function setCaptureRelay(value: CaptureRelay | null): void {
  relay = value;
}

export function captureRelay(): CaptureRelay | null {
  return relay;
}

/** Whether config.json reported a capture relay — the gate for the button and captureNow(). */
export function isCaptureActive(): boolean {
  return relay !== null;
}

export function setCaptureOptions(value: CaptureFeatureOptions): void {
  options = withDefaults(value);
}

export function captureOptions(): Required<CaptureFeatureOptions> {
  return options;
}

function withDefaults(value: CaptureFeatureOptions): Required<CaptureFeatureOptions> {
  return {
    renderButton: value.renderButton ?? true,
    maxDomBytes: value.maxDomBytes ?? DEFAULT_MAX_DOM_BYTES,
  };
}

/** Test seam: the module-level relay/options would otherwise leak across specs. */
export function resetCaptureForTesting(): void {
  relay = null;
  options = withDefaults({});
}
