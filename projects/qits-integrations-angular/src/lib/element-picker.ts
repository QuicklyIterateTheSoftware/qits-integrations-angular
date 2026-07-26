/**
 * The in-app element picker for the capture button — a single-shot analogue of the qits webui's
 * cross-iframe `DomPicker`, but operating on the app's OWN document (same realm, so ordinary code
 * on real nodes; no `contentDocument` hop). Arming shows a `pointer-events: none` overlay that
 * tracks the hovered element and a hint banner; capture-phase listeners keep the pick click from
 * reaching the app (no navigation, no button handler). The first click resolves the chosen
 * element; Escape or a right-click cancels and resolves `undefined`.
 *
 * The overlay and hint are marked `data-qits-pick-overlay` — the same convention the capture
 * button's host carries — so the freeze that follows drops them, and so a click on the picker's
 * own chrome (or the still-mounted capture button) is ignored rather than mistaken for a pick.
 */
export function pickElement(doc: Document): Promise<Element | undefined> {
  const view = doc.defaultView;
  if (!view || !doc.body) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.setAttribute('data-qits-pick-overlay', '');
    Object.assign(overlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      outline: '2px solid #3b82f6',
      background: 'rgba(59, 130, 246, 0.15)',
      display: 'none',
    });
    const hint = doc.createElement('div');
    hint.setAttribute('data-qits-pick-overlay', '');
    hint.textContent = 'Click an element to capture · Esc to cancel';
    Object.assign(hint.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      left: '50%',
      bottom: '16px',
      transform: 'translateX(-50%)',
      background: '#1f2937',
      color: '#f9fafb',
      padding: '8px 14px',
      borderRadius: '8px',
      font: '13px system-ui, sans-serif',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
    });
    doc.body.append(overlay, hint);

    const finish = (picked: Element | undefined): void => {
      doc.removeEventListener('mousemove', onMouseMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('contextmenu', onContextMenu, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      hint.remove();
      resolve(picked);
    };

    const onMouseMove = (event: MouseEvent): void => {
      const target = pickable(event.target);
      if (!target) {
        overlay.style.display = 'none';
        return;
      }
      const rect = target.getBoundingClientRect();
      Object.assign(overlay.style, {
        display: 'block',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
    };

    const onClick = (event: MouseEvent): void => {
      // Clicks on the picker's own chrome / the capture button are swallowed, not picks.
      if (isOverlay(event.target)) {
        stop(event);
        return;
      }
      const target = pickable(event.target);
      if (!target) {
        return;
      }
      stop(event); // the pick must not reach the app
      finish(target);
    };

    // A right-click would open the native context menu over the pick — cancel instead.
    const onContextMenu = (event: Event): void => {
      stop(event);
      finish(undefined);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        stop(event);
        finish(undefined);
      }
    };

    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('contextmenu', onContextMenu, true);
    doc.addEventListener('keydown', onKeyDown, true);
  });
}

function stop(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/** The event target as an element, or null when it is not one (text node, document, …). */
function pickable(target: EventTarget | null): Element | null {
  if (!target || (target as Node).nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = target as Element;
  return isOverlay(element) ? null : element;
}

/** True when the element sits within the picker's own chrome or the capture button. */
function isOverlay(target: EventTarget | null): boolean {
  return (
    target != null &&
    (target as Node).nodeType === Node.ELEMENT_NODE &&
    (target as Element).closest('[data-qits-pick-overlay]') != null
  );
}
