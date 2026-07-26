import {
  collectCaptureState,
  registerCaptureState,
  resetCaptureStateForTesting,
} from './capture-state';

describe('capture-state registry', () => {
  afterEach(() => {
    resetCaptureStateForTesting();
    vi.restoreAllMocks();
  });

  it('collects registered state under its name', () => {
    registerCaptureState('cart', () => ({ items: 2 }));
    expect(collectCaptureState()).toEqual({ cart: { items: 2 } });
  });

  it('returns undefined when nothing is registered — the payload omits state entirely', () => {
    expect(collectCaptureState()).toBeUndefined();
    const unregister = registerCaptureState('cart', () => ({}));
    unregister();
    expect(collectCaptureState()).toBeUndefined();
  });

  it('suppliers run lazily, once per collect — zero cost until capture', () => {
    const supplier = vi.fn(() => 'value');
    registerCaptureState('lazy', supplier);
    expect(supplier).not.toHaveBeenCalled();
    collectCaptureState();
    collectCaptureState();
    expect(supplier).toHaveBeenCalledTimes(2);
  });

  it('a duplicate name warns and the last registration wins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerCaptureState('cart', () => 'first');
    registerCaptureState('cart', () => 'second');
    expect(warn).toHaveBeenCalledOnce();
    expect(collectCaptureState()).toEqual({ cart: 'second' });
  });

  it("the replaced registration's unregister is a no-op — a stale destroy must not tear down the live supplier", () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unregisterFirst = registerCaptureState('cart', () => 'first');
    registerCaptureState('cart', () => 'second');
    unregisterFirst();
    expect(collectCaptureState()).toEqual({ cart: 'second' });
  });

  it('a throwing supplier contributes $error without poisoning the rest', () => {
    registerCaptureState('bad', () => {
      throw new Error('boom');
    });
    registerCaptureState('good', () => 'fine');
    expect(collectCaptureState()).toEqual({
      bad: { $error: 'supplier threw: boom' },
      good: 'fine',
    });
  });

  it('a getter throwing mid-sanitize is caught too', () => {
    registerCaptureState('poisoned', () => ({
      get token(): string {
        throw new Error('no peeking');
      },
    }));
    expect(collectCaptureState()).toEqual({
      poisoned: { $error: 'supplier threw: no peeking' },
    });
  });

  it('an entry over 64 kB collapses to a $truncated marker with its measured size', () => {
    registerCaptureState('huge', () => ({ blob: 'x'.repeat(70_000) }));
    const entry = collectCaptureState()!['huge'] as { $truncated: boolean; bytes: number };
    expect(entry.$truncated).toBe(true);
    expect(entry.bytes).toBeGreaterThan(65_536);
  });
});
