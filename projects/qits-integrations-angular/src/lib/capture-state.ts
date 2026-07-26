import { sanitizeCaptureValue } from './capture-state-sanitize';

/**
 * Capture-state registry: apps register named suppliers whose values become the capture
 * payload's `state` field. Module-level like capture-config — registration (a signalStore's
 * onInit, or an app's own wiring) can predate any capture and must not depend on DI.
 * Suppliers run lazily at capture time only: zero cost until the button is pressed, and the
 * snapshot is of the state at that moment.
 */
export type CaptureStateSupplier = () => unknown;

/** Per-entry cap on the sanitized JSON size; beyond it the entry collapses to a marker. */
const MAX_ENTRY_BYTES = 65_536;

let suppliers = new Map<string, CaptureStateSupplier>();

/**
 * Register a named state supplier; returns an unregister function. A duplicate name replaces the
 * previous supplier with a console.warn (hot-reload re-registration makes throwing hostile).
 */
export function registerCaptureState(name: string, supplier: CaptureStateSupplier): () => void {
  if (suppliers.has(name)) {
    console.warn(`[qits] capture state "${name}" re-registered; the previous supplier is replaced`);
  }
  suppliers.set(name, supplier);
  return () => {
    // Identity-guarded: a stale unregister (destroyed store after a hot-reload re-registration)
    // must not tear down the live supplier that replaced it.
    if (suppliers.get(name) === supplier) {
      suppliers.delete(name);
    }
  };
}

/**
 * Snapshot all registered state, sanitized; undefined when nothing is registered so the payload
 * omits `state` entirely. One bad supplier contributes an $error entry, never a failed capture.
 */
export function collectCaptureState(): Record<string, unknown> | undefined {
  if (suppliers.size === 0) {
    return undefined;
  }
  const state: Record<string, unknown> = {};
  for (const [name, supplier] of suppliers) {
    // The try/catch covers the sanitizer walk too — plain-object getters can throw mid-enumeration.
    try {
      state[name] = capped(sanitizeCaptureValue(supplier()));
    } catch (e) {
      state[name] = { $error: `supplier threw: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return state;
}

/** Wholesale replacement over progressive trimming: an entry that large is an authoring bug. */
function capped(sanitized: unknown): unknown {
  const bytes = new TextEncoder().encode(JSON.stringify(sanitized) ?? '').length;
  return bytes > MAX_ENTRY_BYTES ? { $truncated: true, bytes } : sanitized;
}

/** Test seam: the module-level registry would otherwise leak across specs. */
export function resetCaptureStateForTesting(): void {
  suppliers = new Map();
}
