import { nativeClothStateForModel } from "./NativeClothBabylonPresentation.js";
import { nativeSecondaryMotionStateForModel } from "./NativeSecondaryMotionRuntime.js";

// Shared post-pose stage for gameplay, NPCs, remote players and previews.
// AUTH drives these same model-owned states on its authored clock instead;
// their ownership checks prevent a second advance from the gameplay loop.
export function updateNativeCharacterSecondaryMotion(model, deltaSeconds) {
  if (!model?.loader || !model?.renderRoot || model.characterAssetFormat === "MT7"
      || !model.renderRoot.isEnabled() || !model.latestControllerMatrices) return false;
  const secondary = nativeSecondaryMotionStateForModel(model);
  const cloth = nativeClothStateForModel(model);
  if (secondary.presentationOwner !== null || cloth.presentationOwner !== null) return false;
  const secondaryUpdated = secondary.update(deltaSeconds);
  const clothUpdated = cloth.active && cloth.update(deltaSeconds);
  return secondaryUpdated || clothUpdated;
}

export function releaseNativeCharacterSecondaryMotion(model) {
  if (!model?.loader || !model?.renderRoot || model.characterAssetFormat === "MT7") return;
  nativeSecondaryMotionStateForModel(model, { create: false })?.release();
  const cloth = nativeClothStateForModel(model, { create: false });
  if (cloth?.presentationOwner === null) cloth.release();
}
