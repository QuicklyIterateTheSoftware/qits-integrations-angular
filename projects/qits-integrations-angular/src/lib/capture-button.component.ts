import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { navigateTop } from './capture-navigation';
import { captureNow } from './capture-now';
import { pickElement } from './element-picker';

/**
 * The floaty capture button: press → pick an element → spinner → snapshot → POST → navigate the
 * top window to the created workspace. Bottom-LEFT, to avoid colliding with qits' own bottom-right
 * floaties when the app runs framed in the web view. Styles are self-contained — no dependency on
 * the host app's CSS framework. On failure a retry-able toast, the app undisturbed.
 *
 * The press arms an in-app element picker (see pickElement): the user clicks the element to submit,
 * and its owning `app-*` component is frozen alongside the whole page. Escape or a right-click
 * cancels back to idle.
 *
 * The host carries data-qits-pick-overlay so the frozen snapshot excludes the button itself —
 * and, reusing the picker's convention, both this button's own picker and qits' element picker
 * skip it too.
 */
@Component({
  selector: 'qits-capture-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-qits-pick-overlay': '' },
  template: `
    @if (state() === 'error') {
      <div class="qits-capture-toast" role="alert">Capture failed — press to retry</div>
    }
    <button
      type="button"
      class="qits-capture-button"
      [class.qits-capture-busy]="state() === 'busy'"
      [class.qits-capture-picking]="state() === 'picking'"
      [disabled]="state() === 'busy' || state() === 'picking'"
      (click)="capture()"
      aria-label="Capture this page into qits"
      title="Capture this page into qits"
    >
      @if (state() === 'busy') {
        <span class="qits-capture-spinner" aria-hidden="true"></span>
      } @else {
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M9.4 4l-1.8 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0
               0 0-2-2h-3.6l-1.8-2H9.4zM12 9a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5
               2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
          />
        </svg>
      }
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: system-ui, sans-serif;
    }
    .qits-capture-button {
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: #1f2937;
      color: #f9fafb;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
    .qits-capture-button:hover:not(:disabled) {
      background: #374151;
    }
    .qits-capture-busy {
      cursor: wait;
    }
    .qits-capture-picking {
      background: #2563eb;
      cursor: crosshair;
    }
    .qits-capture-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(249, 250, 251, 0.3);
      border-top-color: #f9fafb;
      border-radius: 50%;
      animation: qits-capture-spin 0.8s linear infinite;
    }
    @keyframes qits-capture-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .qits-capture-toast {
      order: 1;
      background: #7f1d1d;
      color: #fef2f2;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      max-width: 260px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
  `,
})
export class QitsCaptureButton {
  protected readonly state = signal<'idle' | 'picking' | 'busy' | 'error'>('idle');

  protected async capture(): Promise<void> {
    if (this.state() === 'busy' || this.state() === 'picking') {
      return;
    }
    this.state.set('picking');
    const target = await pickElement(document);
    if (!target) {
      this.state.set('idle'); // Escape / right-click cancelled the pick — no capture
      return;
    }
    this.state.set('busy');
    try {
      const result = await captureNow(target);
      navigateTop(result.url);
      this.state.set('idle');
    } catch {
      this.state.set('error'); // the button stays pressable — the toast says retry
    }
  }
}
