import {
  createCutsceneDepthHaze,
  normalizeCutsceneDepthHaze,
} from "./CutsceneDepthHaze.js";
import { createPlayNativeCutsceneDirector } from "./PlayNativeCutsceneDirector.js";

export function createNativeCutsceneAssembly({
  scene,
  camera,
  scheduledActors,
  motionRuntime,
  audioPreferences,
  dialogueAudio,
  dialogueDom,
  musicControls,
  fetchArrayBuffer,
  getSkybox,
  controlActorLookPoint,
  getPlayerModel,
  syncPlayerTransform,
  getController,
  setPresentationActive,
  synchronizeWorldTime,
  getNativeRuntime,
  getRoomScripts,
  getWorldId,
  getPreviewRuntime,
  transientNotice,
  getWorld,
  selectWorld,
}) {
  let activeLightingPresetIndex = null;
  const director = createPlayNativeCutsceneDirector({
    packageRuntimeOptions: {
      scene,
      camera,
      scheduledActors,
      motionRuntime,
      audioPreferences,
      dialogueAudio,
      dialogueDom,
      musicControls,
      fetchArrayBuffer,
      getSkybox,
      controlActorLookPoint,
      getPlayerModel,
      syncPlayerTransform,
    },
    acquireGameplay: (cutscene) => {
      const controller = getController();
      if (!controller) throw new Error("gameplay controller is unavailable");
      const requestedLightingPresetIndex = cutscene?.lightingPresetIndex;
      const requestedDepthHaze = normalizeCutsceneDepthHaze(
        cutscene?.depthHaze,
      );
      if (
        requestedLightingPresetIndex !== undefined
        && (
          !Number.isInteger(requestedLightingPresetIndex)
          || requestedLightingPresetIndex < 0
          || requestedLightingPresetIndex > 3
        )
      ) {
        throw new Error(
          `Cutscene ${cutscene?.id || "unknown"} lighting preset is invalid`,
        );
      }
      const snapshot = {
        noClip: controller.noClip,
        movementLocked: controller.movementLocked,
        lightingPresetIndex: activeLightingPresetIndex,
      };
      controller.setMovementLocked(true);
      controller.setNoClip(true);
      setPresentationActive(true);
      musicControls.setPlaybackPaused(false);
      if (requestedLightingPresetIndex !== undefined) {
        activeLightingPresetIndex = requestedLightingPresetIndex;
      }
      synchronizeWorldTime();
      const depthHaze = requestedDepthHaze
        ? createCutsceneDepthHaze({
          scene,
          camera: scene.activeCamera,
          options: requestedDepthHaze,
        })
        : null;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        controller.setNoClip(snapshot.noClip);
        controller.setMovementLocked(snapshot.movementLocked);
        setPresentationActive(false);
        if (requestedLightingPresetIndex !== undefined) {
          activeLightingPresetIndex = snapshot.lightingPresetIndex;
        }
        depthHaze?.dispose();
        synchronizeWorldTime();
      };
    },
    programRuntimeOptions: {
      getNativeRuntime,
      getArea: () => getRoomScripts().activeArea,
      getWorldId,
      activateArea: area => getRoomScripts().activateArea(area),
      restoreArea: area => getRoomScripts().activateArea(area),
    },
    onComplete: (cutscene) => {
      if (getPreviewRuntime().complete()) return;
      const completion = cutscene.completion;
      if (completion?.notice) transientNotice.show(completion.notice);
      const destination = completion?.worldId
        ? getWorld(completion.worldId)
        : null;
      if (destination) {
        void selectWorld(destination, {
          controllerState: null,
          persistLocation: false,
        });
      }
    },
    onStopped: (cutscene, reason) => {
      if (reason === "user-cancelled" || reason === "world-change") {
        getPreviewRuntime().complete();
        return;
      }
      getPreviewRuntime().fail(cutscene, reason);
    },
  });
  Object.defineProperty(director, "activeLightingPresetIndex", {
    configurable: false,
    enumerable: true,
    get: () => activeLightingPresetIndex,
  });
  return director;
}
