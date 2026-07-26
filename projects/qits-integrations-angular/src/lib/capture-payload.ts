import type { CaptureRelay } from './capture-config';
import { collectCaptureState } from './capture-state';
import type { FrozenDocument } from './document-freeze';
import { currentRoutePattern } from './route-context';

/**
 * The capture payload, field-for-field what qits' ingest (CaptureResource.CaptureRequest)
 * parses. The identity is self-stamped from the config.json relay — the browser is at the same
 * unauthenticated trust level either way, and the ingest fails closed on identity it can't
 * resolve.
 */
export interface CapturePayload {
  capturedAt: string;
  identity: {
    'qits.repository.id': string | null;
    'qits.workspace.id': string | null;
  };
  page: {
    url: string;
    appPath: string;
    routePattern: string | null;
    title: string;
  };
  environment: {
    viewport: { width: number; height: number; devicePixelRatio: number };
    userAgent: string;
    prefersColorScheme: string;
  };
  dom: {
    html: string;
    truncated: boolean;
    bytes: number;
  };
  /**
   * The style-frozen subtree the user picked (the nearest enclosing `app-*` component); absent when
   * the capture carried no pick (e.g. a custom trigger firing captureNow() with no target).
   */
  selection?: CaptureSelection;
  /** Registered app state ({name: snapshot}); absent when nothing is registered. */
  state?: Record<string, unknown>;
}

/** The picked component's frozen subtree plus the provenance of the pick that produced it. */
export interface CaptureSelection {
  html: string;
  truncated: boolean;
  bytes: number;
  /** CSS selector of the element the user actually clicked. */
  selector: string;
  /** Tag of the picked element (lowercase). */
  tag: string;
  /** The `app-*` component tag whose subtree was frozen, or null when none enclosed the pick. */
  component: string | null;
}

export function buildCapturePayload(
  dom: FrozenDocument,
  relay: CaptureRelay,
  selection?: CaptureSelection,
): CapturePayload {
  const state = collectCaptureState();
  return {
    capturedAt: new Date().toISOString(),
    identity: {
      'qits.repository.id': relay.resourceAttributes['qits.repository.id'] ?? null,
      'qits.workspace.id': relay.resourceAttributes['qits.workspace.id'] ?? null,
    },
    page: {
      url: location.href,
      appPath: appPath(),
      routePattern: currentRoutePattern() ?? null,
      title: document.title,
    },
    environment: {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      userAgent: navigator.userAgent,
      prefersColorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    },
    dom,
    ...(selection !== undefined && { selection }),
    ...(state !== undefined && { state }),
  };
}

/** The app-side path: the document URL with the <base> prefix stripped (rebased deploys keep it). */
function appPath(): string {
  const href = location.href;
  const base = document.baseURI;
  if (href.startsWith(base)) {
    return href.slice(base.length);
  }
  return location.pathname.replace(/^\//, '');
}
