/**
 * Navigation seam for the capture button. Top window deliberately: a capture from inside the
 * qits web view lands the qits TAB on the new workspace, instead of navigating the framed app
 * away inside its iframe. A seam because `window.top.location` cannot be stubbed in browser
 * specs.
 */
let navigate: (url: string) => void = (url) => {
  (window.top ?? window).location.assign(url);
};

export function navigateTop(url: string): void {
  navigate(url);
}

/** Test seam: pass a spy, or undefined to restore the real navigation. */
export function setNavigateTopForTesting(fn: ((url: string) => void) | undefined): void {
  navigate = fn ?? ((url) => (window.top ?? window).location.assign(url));
}
