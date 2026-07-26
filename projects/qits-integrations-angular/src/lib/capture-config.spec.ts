import {
  DEFAULT_MAX_DOM_BYTES,
  captureOptions,
  captureRelay,
  isCaptureActive,
  resetCaptureForTesting,
  setCaptureOptions,
  setCaptureRelay,
} from './capture-config';

describe('capture config state', () => {
  afterEach(() => {
    resetCaptureForTesting();
  });

  it('is dark by default: no relay, capture inactive', () => {
    expect(captureRelay()).toBeNull();
    expect(isCaptureActive()).toBe(false);
  });

  it('a stashed relay activates capture', () => {
    setCaptureRelay({ ingestUrl: 'http://qits:8080/api/capture', resourceAttributes: {} });
    expect(isCaptureActive()).toBe(true);
    expect(captureRelay()?.ingestUrl).toBe('http://qits:8080/api/capture');
  });

  it('options default to a rendered button and the 2 MB cap', () => {
    expect(captureOptions()).toEqual({ renderButton: true, maxDomBytes: DEFAULT_MAX_DOM_BYTES });
  });

  it('partial options keep the other defaults', () => {
    setCaptureOptions({ renderButton: false });
    expect(captureOptions()).toEqual({ renderButton: false, maxDomBytes: DEFAULT_MAX_DOM_BYTES });
  });

  it('the test reset restores relay and options', () => {
    setCaptureRelay({ ingestUrl: 'http://x/api/capture', resourceAttributes: {} });
    setCaptureOptions({ maxDomBytes: 5 });
    resetCaptureForTesting();
    expect(isCaptureActive()).toBe(false);
    expect(captureOptions().maxDomBytes).toBe(DEFAULT_MAX_DOM_BYTES);
  });
});
