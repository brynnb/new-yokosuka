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
  acquireEnvironmentIsolation,
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
  coverLoading,
  finishLoading,
}) {
  let activeLightingPresetIndex = null;
  let activeLightingOverride = null;
  let activePrecipitation = null;
  const director = createPlayNativeCutsceneDirector({
    beforeComplete: cutscene => {
      if (cutscene.storyPresentation) return Promise.resolve();
      getPreviewRuntime().beginEnding(cutscene.id);
      return coverLoading();
    },
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
      acquireEnvironmentIsolation,
      acquireActivityLighting: (index, lightingOverride = null) => {
        const previous = activeLightingPresetIndex;
        const previousOverride = activeLightingOverride;
        activeLightingPresetIndex = index;
        activeLightingOverride = lightingOverride;
        synchronizeWorldTime();
        let released = false;
        return () => {
          if (released) return;
          released = true;
          activeLightingPresetIndex = previous;
          activeLightingOverride = previousOverride;
          synchronizeWorldTime();
        };
      },
      controlActorLookPoint,
      getPlayerModel,
      syncPlayerTransform,
    },
    acquireGameplay: (cutscene) => {
      const controller = getController();
      if (!controller) throw new Error("gameplay controller is unavailable");
      const requestedLightingPresetIndex = cutscene?.lightingPresetIndex;
      const requestedPrecipitation = cutscene?.precipitation;
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
      if (requestedPrecipitation !== undefined
        && !["clear", "rain", "snow"].includes(requestedPrecipitation)) {
        throw new Error(`Cutscene ${cutscene?.id || "unknown"} precipitation is invalid`);
      }
      const snapshot = {
        noClip: controller.noClip,
        lightingPresetIndex: activeLightingPresetIndex,
        precipitation: activePrecipitation,
      };
      const releaseMovementLock = controller.acquireMovementLock();
      controller.setNoClip(true);
      setPresentationActive(true);
      musicControls.setPlaybackPaused(false);
      if (requestedLightingPresetIndex !== undefined) {
        activeLightingPresetIndex = requestedLightingPresetIndex;
      }
      if (requestedPrecipitation !== undefined) activePrecipitation = requestedPrecipitation;
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
        releaseMovementLock();
        setPresentationActive(false);
        if (requestedLightingPresetIndex !== undefined) {
          activeLightingPresetIndex = snapshot.lightingPresetIndex;
        }
        activePrecipitation = snapshot.precipitation;
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
      if (cutscene.storyPresentation) return;
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
      } else {
        void finishLoading();
      }
    },
    onStopped: (cutscene, reason) => {
      if (cutscene.storyPresentation) return;
      if (["user-cancelled", "world-change", "superseded", "disposed"].includes(reason)) {
        const previewCompleted = getPreviewRuntime().complete();
        if (!previewCompleted && reason === "user-cancelled") void finishLoading();
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
  Object.defineProperty(director, "activePrecipitation", {
    enumerable: true,
    get: () => activePrecipitation,
  });
  Object.defineProperty(director, "activeLightingOverride", {
    enumerable: true,
    get: () => activeLightingOverride,
  });
  return director;
}
