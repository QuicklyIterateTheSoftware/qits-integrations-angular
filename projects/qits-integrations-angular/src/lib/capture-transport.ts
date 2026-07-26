import type { CaptureRelay } from './capture-config';
import type { CapturePayload } from './capture-payload';

/**
 * The daemon web-view proxy base (/daemon/{workspaceId}/{daemonId}/) — when the app is served
 * under it, the frame origin IS qits. Same shape the fixture's index.html uses for its <base>
 * rebase.
 */
export const DAEMON_BASE_PATTERN = /^\/daemon\/[^/]+\/[^/]+\//;

/**
 * Where to POST: the relayed ingestUrl is composed for container-to-qits reachability (`qits` on
 * qits-net, host.docker.internal, …) and is generally not resolvable from the user's browser.
 * Framed under the daemon proxy the frame origin is qits itself, so the same-origin path wins
 * there (CORS moot); everywhere else the relayed URL is used verbatim (deployed apps configure a
 * browser-reachable one).
 */
export function captureTargetUrl(relay: CaptureRelay): string {
  if (DAEMON_BASE_PATTERN.test(location.pathname)) {
    return new URL('/api/capture', location.origin).href;
  }
  return relay.ingestUrl;
}

/**
 * Probe the capture ingest with a bare OPTIONS: qits' CORS route answers 204 where the API
 * exists; a backend without it 404s and an unreachable host throws — both mean "hide the
 * button". A relayed config section proves intent, this proves the POST would actually land.
 */
export async function captureApiAvailable(relay: CaptureRelay): Promise<boolean> {
  try {
    const response = await fetch(captureTargetUrl(relay), { method: 'OPTIONS' });
    return response.ok;
  } catch {
    return false;
  }
}

export class CaptureError extends Error {}

/** Gzip-POST the payload; resolves the created workspace's browser URL from the 201 body. */
export async function postCapture(payload: CapturePayload, url: string): Promise<{ url: string }> {
  const body = await gzip(JSON.stringify(payload));
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body,
    });
  } catch {
    throw new CaptureError('Could not reach the qits capture endpoint');
  }
  if (response.status !== 201) {
    throw new CaptureError(`Capture ingest answered ${response.status}`);
  }
  const created = (await response.json()) as { url?: string };
  if (!created.url) {
    throw new CaptureError('Capture ingest returned no workspace URL');
  }
  return { url: created.url };
}

// Buffered, not streamed: a streaming fetch body needs `duplex`, and the DOM dominates the
// payload anyway — ~10:1 compression on one buffered body is plenty.
async function gzip(json: string): Promise<ArrayBuffer> {
  const compressed = new Response(json).body!.pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).arrayBuffer();
}
