import {
  getState,
  signalStoreFeature,
  withHooks,
  type EmptyFeatureResult,
  type SignalStoreFeature,
} from '@ngrx/signals';
import { registerCaptureState } from './capture-state';

/**
 * signalStore feature: registers the store's plain state under `name` in the capture-state
 * registry, so captures carry what the store knew. Only withState slices are captured (that is
 * what getState sees); computeds are derivable and deliberately excluded.
 *
 * Registration happens in onInit, not the feature factory — the factory runs mid-store-
 * construction. onDestroy unregisters: a component-provided store must not leave a dangling
 * supplier reading a dead store. The supplier itself is injection-context-free (getState is a
 * pure signal read), so it is safe to run at capture time from outside Angular.
 */
export function withQitsSnapshot(
  name: string,
): SignalStoreFeature<EmptyFeatureResult, EmptyFeatureResult> {
  return signalStoreFeature(
    withHooks((store) => {
      let unregister: (() => void) | undefined;
      return {
        onInit: () => {
          unregister = registerCaptureState(name, () => getState(store));
        },
        onDestroy: () => unregister?.(),
      };
    }),
  );
}
