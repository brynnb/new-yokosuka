import {
  createNativeCutsceneDirector,
} from "./NativeCutsceneDirector.js";
import {
  createNativeCutscenePackageRegistry,
} from "./NativeCutscenePackageRegistry.js";
import { NATIVE_CUTSCENE_PACKAGES } from "./nativeCutscenePackages.js";

export const nativeCutscenePackageRegistry =
  createNativeCutscenePackageRegistry(NATIVE_CUTSCENE_PACKAGES);

export function createPlayNativeCutsceneDirector(options) {
  return createNativeCutsceneDirector({
    ...options,
    registry: nativeCutscenePackageRegistry,
  });
}
