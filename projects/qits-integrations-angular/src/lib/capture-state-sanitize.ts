/**
 * JSON-safe sanitizer for capture-state suppliers: their return values are arbitrary, and a
 * capture must never fail because of one bad store. Every replacement is a string marker so the
 * result always survives JSON.stringify (BigInt is the one value stringify *throws* on — it is
 * converted before ever reaching the payload-level stringify in capture-transport).
 */
const DEPTH_CAP = 8;

export function sanitizeCaptureValue(value: unknown): unknown {
  return sanitize(value, 0, new Set());
}

function sanitize(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  switch (typeof value) {
    case 'string':
    case 'boolean':
    case 'number': // NaN/Infinity become null at JSON.stringify time — acceptable
      return value;
    case 'bigint':
      return String(value);
    case 'symbol':
      return '$unserializable(symbol)';
    case 'function':
      return '$unserializable(function)';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return `$unserializable(${value.constructor?.name ?? 'Node'})`;
  }
  if (depth >= DEPTH_CAP) {
    return '$depth-capped';
  }
  // Ancestor-path (not global visited) tracking: shared DAG references serialize normally,
  // only a genuine cycle collapses to the marker.
  if (ancestors.has(value as object)) {
    return '$circular';
  }
  ancestors.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitize(entry, depth + 1, ancestors));
    }
    if (value instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of value) {
        out[String(key)] = sanitize(entry, depth + 1, ancestors);
      }
      return out;
    }
    if (value instanceof Set) {
      return [...value].map((entry) => sanitize(entry, depth + 1, ancestors));
    }
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        const sanitized = sanitize(entry, depth + 1, ancestors);
        if (sanitized !== undefined) {
          out[key] = sanitized;
        }
      }
      return out;
    }
    // Typed arrays (megabytes of canvas pixels), ArrayBuffers, class instances: curation is the
    // author's job — a projection supplier beats the library guessing at a serialization.
    return `$unserializable(${(value as object).constructor?.name || 'Object'})`;
  } finally {
    ancestors.delete(value as object);
  }
}
