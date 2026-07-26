import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { captureOptions, resetCaptureForTesting, setCaptureRelay } from './capture-config';
import { provideQitsIntegration } from './provide-qits-integration';
import {
  mountCaptureButton,
  resetCaptureButtonMountForTesting,
  withFeatureCapture,
} from './with-feature-capture';

const RELAY = { ingestUrl: 'http://qits:8080/api/capture', resourceAttributes: {} };

describe('withFeatureCapture', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    resetCaptureForTesting();
    resetCaptureButtonMountForTesting();
    document.querySelectorAll('qits-capture-button').forEach((el) => el.remove());
  });

  /** The OPTIONS availability probe — qits' CORS route answers 204 where the ingest exists. */
  function stubProbe(status: number | Error): ReturnType<typeof vi.fn> {
    const mock =
      status instanceof Error
        ? vi.fn().mockRejectedValue(status)
        : vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });
    window.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  function mount(): Promise<void> {
    return mountCaptureButton(TestBed.inject(ApplicationRef), TestBed.inject(EnvironmentInjector));
  }

  it('stashes the feature options via an environment initializer', () => {
    TestBed.configureTestingModule({
      providers: [provideQitsIntegration(withFeatureCapture({ renderButton: false }))],
    });
    TestBed.inject(EnvironmentInjector); // creating the environment runs its initializers
    expect(captureOptions().renderButton).toBe(false);
  });

  it('does not mount the button when capture is dark (no relay in config.json)', async () => {
    const probe = stubProbe(204);
    TestBed.configureTestingModule({ providers: [provideQitsIntegration(withFeatureCapture())] });
    await mount();
    expect(document.querySelector('qits-capture-button')).toBeNull();
    expect(probe).not.toHaveBeenCalled(); // dark ⇒ not even probed
  });

  it('does not mount the button with renderButton: false — captureNow() is the trigger then', async () => {
    stubProbe(204);
    setCaptureRelay(RELAY);
    TestBed.configureTestingModule({
      providers: [provideQitsIntegration(withFeatureCapture({ renderButton: false }))],
    });
    TestBed.inject(EnvironmentInjector);
    await mount();
    expect(document.querySelector('qits-capture-button')).toBeNull();
  });

  it('mounts the button once when the relay is lit and the ingest answers the OPTIONS probe', async () => {
    const probe = stubProbe(204);
    setCaptureRelay(RELAY);
    TestBed.configureTestingModule({ providers: [provideQitsIntegration(withFeatureCapture())] });
    await mount();
    await mount();
    const buttons = document.querySelectorAll('qits-capture-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].parentElement).toBe(document.body);
    // The picker/freeze exclusion convention — the snapshot must not contain its own trigger.
    expect(buttons[0].hasAttribute('data-qits-pick-overlay')).toBe(true);
    // The probe targets exactly where the POST would go.
    expect(probe).toHaveBeenCalledWith(RELAY.ingestUrl, { method: 'OPTIONS' });
  });

  it('hides the button when the probe 404s (backend without the ingest)', async () => {
    stubProbe(404);
    setCaptureRelay(RELAY);
    TestBed.configureTestingModule({ providers: [provideQitsIntegration(withFeatureCapture())] });
    await mount();
    expect(document.querySelector('qits-capture-button')).toBeNull();
  });

  it('hides the button when the ingest is unreachable from this browser', async () => {
    stubProbe(new Error('unreachable'));
    setCaptureRelay(RELAY);
    TestBed.configureTestingModule({ providers: [provideQitsIntegration(withFeatureCapture())] });
    await mount();
    expect(document.querySelector('qits-capture-button')).toBeNull();
  });
});
