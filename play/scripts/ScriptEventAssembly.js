import {
  createNativeScriptActivityRunner,
} from "./NativeScriptActivityRunner.js";
import {
  createMotionCuePresentationRuntime,
} from "./MotionCuePresentationRuntime.js";
import {
  createScriptAutomaticEventRuntime,
  nativeAutomaticGateInputUnavailable,
} from "./ScriptAutomaticEventRuntime.js";
import {
  createScriptEventBabylonAdapters,
} from "./ScriptEventBabylonAdapters.js";
import {
  createScriptEventController,
} from "./ScriptEventController.js";
import {
  createScriptEventDialoguePresenter,
} from "./ScriptEventDialoguePresenter.js";
import {
  createScriptEventPresentationRuntime,
} from "./ScriptEventPresentationRuntime.js";
import {
  createTelephonePresentationRuntime,
} from "./TelephonePresentationRuntime.js";
import {
  createTelephoneReceiverBabylonAdapter,
} from "./TelephoneReceiverBabylonAdapter.js";
import { AuthoredSceneStagingRuntime } from "./AuthoredSceneStagingRuntime.js";
import { StoryCombatRuntime } from "./StoryCombatRuntime.js";
import {StoryNavigationRuntime} from "./StoryNavigationRuntime.js";
import {StoryForkliftChallengeRuntime} from "./StoryForkliftChallengeRuntime.js";
import {NativeAseqSceneObjectRuntime} from "../events/NativeAseqSceneObjectRuntime.js";
import { createNativeAseqBabylonActors, createNativeAseqBabylonCamera } from "../events/NativeAseqBabylonPresentation.js";
import { NativeAseqAttachedObjectRuntime } from "../events/NativeAseqAttachedObjectRuntime.js";
import { createNativeCutsceneSceneObjectLoader } from "../cutscenes/NativeCutsceneSceneObjectLoader.js";
import { fetchAssetBuffer } from "../../src/AssetCache.js";
import { runtimeAssetUrl } from "../../src/RuntimeAssets.js";

export function createScriptEventAssembly({
  nativeRuntime,
  cutsceneDirector,
  getArea,
  dialoguePersistence,
  selectedObjectActionController,
  modelOffset,
  currentMeshes,
  renderMatrixByKey,
  animation,
  retargetCharacterMatrices,
  worldSounds,
  roomScripts,
  playerXmptRuntime,
  playerMotionRuntime,
  cameraRuntime,
  scheduledActors,
  getPlayerPosition,
  capturePlayerState,
  restorePlayerState,
  camera,
  scene,
  getPlayerModel,
  syncPlayerTransform,
  motionRuntime,
  getController,
  getForklifts,
  getBinding,
  cameraPresentation,
  acquireMovementLock,
  dom,
  dialogueAudio,
  setDialogueControlsActive,
  getMultiplayerClient,
  addSystemMessage,
  transientNotice,
  localDebug = false,
}) {
  const activityRunner = createNativeScriptActivityRunner({
    nativeRuntime,
    cutsceneDirector,
    getArea,
    captureClientState: () => dialoguePersistence.captureWorkingState(),
    restoreClientState: snapshot => (
      dialoguePersistence.restoreWorkingState(snapshot)
    ),
    capturePlayerState,
    restorePlayerState,
    selectedObjectActionController,
  });
  const telephoneReceiver = createTelephoneReceiverBabylonAdapter({
    modelOffset,
    resolveObjectRoot: objectTag => {
      const matches = currentMeshes().filter(root => (
        root?._runtimePlacement === true
        && root._runtimePlacementRecord?.runtime?.objectTag === objectTag
        && !root.isDisposed?.()
      ));
      return matches.length === 1 ? matches[0] : null;
    },
    getPlayerControlSourceMatrix: ({
      actorCode,
      renderKey,
      runtimeMatrixIndex,
    }) => {
      if (
        actorCode !== "AKIR"
        || renderMatrixByKey.get(renderKey) !== runtimeMatrixIndex
        || !animation.ready
      ) return null;
      return retargetCharacterMatrices(
        animation.currentRoutes(animation.accumulator).routedMatrices,
      ).get(renderKey) || null;
    },
  });
  const playSound = cue => {
    worldSounds.playCommand(cue.commandHex, {
      bank: cue.bank,
      extension: cue.extension,
    });
    return true;
  };
  const telephoneRuntime = createTelephonePresentationRuntime({
    playSound,
    attachReceiver: (binding, owner) => telephoneReceiver.attach(binding, owner),
    updateReceiver: (binding, owner) => telephoneReceiver.update(binding, owner),
    detachReceiver: (binding, owner) => telephoneReceiver.detach(binding, owner),
  });
  const motionCueRuntime = createMotionCuePresentationRuntime({
    xmptState: roomScripts.sceneState,
    playerXmptRuntime,
    playerMotionRuntime,
    playSound,
  });
  let controller;
  const createAttachedObjects=(definitions,resolveActor,signal)=>new NativeAseqAttachedObjectRuntime({definitions,resolveActor,
    instantiateAsset:createNativeCutsceneSceneObjectLoader({scene,loadAsset:path=>fetchAssetBuffer(runtimeAssetUrl(path),{signal})}),
  });
  const combatRuntime=new StoryCombatRuntime({
    actors:createNativeAseqBabylonActors({getPlayerModel,syncPlayerTransform,scheduledActors,motionRuntime,
      preservePlayerOnComplete:false,playerYawOffsetRadians:Math.PI}),
    motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,
    onIntent:(action,token,intent)=>controller?.combatResponse(action,token,intent),
  });
  const navigationRuntime=new StoryNavigationRuntime({
    actors:createNativeAseqBabylonActors({getPlayerModel,syncPlayerTransform,scheduledActors,motionRuntime,preservePlayerOnComplete:false,playerYawOffsetRadians:Math.PI}),
    motionRuntime,getController,getBinding,capturePlayerState,restorePlayerState,createAttachedObjects,
    onIntent:(action,token,intent)=>controller?.navigationResponse(action,token,intent),
  });
  const vehicleChallengeRuntime=new StoryForkliftChallengeRuntime({scene,getForklifts,getController,capturePlayerState,restorePlayerState,acquireMovementLock,
    onIntent:(action,token)=>controller?.challengeResponse(action,token)});
  const presentation = createScriptEventPresentationRuntime({
    adapters: createScriptEventBabylonAdapters({
      cameraRuntime,
      combatRuntime,
      navigationRuntime,
      vehicleChallengeRuntime,
      sceneStagingRuntime: new AuthoredSceneStagingRuntime({
        actors: createNativeAseqBabylonActors({ getPlayerModel, syncPlayerTransform,
          scheduledActors, motionRuntime, preservePlayerOnComplete: false, playerYawOffsetRadians: Math.PI }),
        camera: createNativeAseqBabylonCamera(camera), motionRuntime,
        capturePlayerState, restorePlayerState,
        createAttachedObjects,
        createSceneObjects:(definitions,signal)=>new NativeAseqSceneObjectRuntime({definitions,
          instantiateAsset:createNativeCutsceneSceneObjectLoader({scene,loadAsset:path=>fetchAssetBuffer(runtimeAssetUrl(path),{signal})})}),
        currentMeshes,
      }),
      playerMotionRuntime,
      playerXmptRuntime,
      scheduledActors,
      getArea,
      getPlayerPosition,
      beginCameraPresentation: cameraPresentation.begin,
      abortCameraPresentation: cameraPresentation.abort,
      acquireMovementLock,
      startActivity: (activity, context) => (
        activityRunner.start(activity, context)
      ),
      cancelActivity: (_activity, reason) => activityRunner.cancel(reason),
      telephoneRuntime,
      motionCueRuntime,
    }),
  });
  const dialoguePresenter = createScriptEventDialoguePresenter({
    root: dom.dialogueOverlay,
    speaker: dom.dialogueSpeaker,
    sourceText: dom.dialogueSource,
    japaneseText: dom.dialogueJapanese,
    options: dom.dialogueOptions,
    audioSettings: dialogueAudio,
    onAdvance: () => controller?.advanceLine(),
    onSelect: optionId => controller?.selectOption(optionId),
    onChallengeResponse: (action,token,button) => controller?.challengeResponse(action,token,button),
    onCombatAction:action=>combatRuntime.action(action),
    onCombatGuard:guard=>combatRuntime.setGuard(guard),
    onNavigationUse:()=>navigationRuntime.use(),
    onNavigationHide:hide=>navigationRuntime.hide(hide),
    onNavigationDirection:(x,z)=>navigationRuntime.direction(x,z),
    onActiveChanged: setDialogueControlsActive,
  });
  controller = createScriptEventController({
    client: {
      startScriptEvent: (...args) => (
        getMultiplayerClient()?.startScriptEvent(...args) === true
      ),
      advanceScriptEvent: (...args) => (
        getMultiplayerClient()?.advanceScriptEvent(...args) === true
      ),
    },
    presentation,
    dialogue: dialoguePresenter,
    prepareStart: options => dialoguePersistence.beginServerEvent(options),
    onStarted: identity => {
      if (localDebug) console.info("[Script started]", identity);
    },
    onError: error => {
      console.error("Database script event stopped:", error);
      addSystemMessage(
        "That scripted interaction could not be presented completely.",
      );
    },
  });
  const automaticEvents = createScriptAutomaticEventRuntime({
    controller,
    pollNative: async ({ area, context }) => {
      if (!nativeRuntime.hasAutomaticEvents(area)) {
        return { status: "not-matched", reason: "native-route-missing", area };
      }
      const result = await nativeRuntime.pollAutomaticEvents({
        area,
        context: context.nativeContext,
      });
      if (nativeAutomaticGateInputUnavailable(result)) {
        return {
          status: "not-matched",
          reason: "native-gate-input-unavailable",
          area,
          unavailable: result.reason.result.reason,
        };
      }
      if (result.status === "stopped") {
        console.warn("Native automatic event gate stopped:", result);
      }
      return result;
    },
    onError: error => {
      console.error("Database automatic script event stopped:", error);
      transientNotice.show("An automatic story event could not start.");
    },
  });

  return {
    activityRunner,
    telephoneRuntime,
    motionCueRuntime,
    presentation,
    dialoguePresenter,
    controller,
    automaticEvents,
  };
}
