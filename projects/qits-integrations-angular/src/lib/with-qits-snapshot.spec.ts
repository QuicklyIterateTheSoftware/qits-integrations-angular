import { TestBed } from '@angular/core/testing';
import { getState, patchState, signalStore, withState } from '@ngrx/signals';
import { collectCaptureState, resetCaptureStateForTesting } from './capture-state';
import { withQitsSnapshot } from './with-qits-snapshot';

// protectedState off so the spec can patchState from outside; irrelevant to the feature itself.
const TestStore = signalStore(
  { protectedState: false },
  withState({ greetings: ['anna'], count: 1 }),
  withQitsSnapshot('test'),
);

describe('withQitsSnapshot', () => {
  afterEach(() => {
    resetCaptureStateForTesting();
  });

  it('registers the store state on init, with getState parity', () => {
    TestBed.configureTestingModule({ providers: [TestStore] });
    const store = TestBed.inject(TestStore);
    expect(collectCaptureState()!['test']).toEqual(getState(store));
    expect(collectCaptureState()!['test']).toEqual({ greetings: ['anna'], count: 1 });
  });

  it('snapshots the state at capture time, not at registration', () => {
    TestBed.configureTestingModule({ providers: [TestStore] });
    const store = TestBed.inject(TestStore);
    patchState(store, { greetings: ['anna', 'bert'], count: 2 });
    expect(collectCaptureState()!['test']).toEqual({ greetings: ['anna', 'bert'], count: 2 });
  });

  it('unregisters on destroy — no dangling supplier reading a dead store', () => {
    TestBed.configureTestingModule({ providers: [TestStore] });
    TestBed.inject(TestStore);
    expect(collectCaptureState()).toBeDefined();
    TestBed.resetTestingModule(); // destroys the testing injector → the store's onDestroy
    expect(collectCaptureState()).toBeUndefined();
  });
});
