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

export function createScriptEventAssembly({
  nativeRuntime,
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
  cameraPresentation,
  getMovementLocked,
  setMovementLocked,
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
    getArea,
    captureClientState: () => dialoguePersistence.captureWorkingState(),
    restoreClientState: snapshot => (
      dialoguePersistence.restoreWorkingState(snapshot)
    ),
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
  const presentation = createScriptEventPresentationRuntime({
    adapters: createScriptEventBabylonAdapters({
      cameraRuntime,
      playerMotionRuntime,
      playerXmptRuntime,
      scheduledActors,
      getArea,
      getPlayerPosition,
      beginCameraPresentation: cameraPresentation.begin,
      abortCameraPresentation: cameraPresentation.abort,
      getMovementLocked,
      setMovementLocked,
      startActivity: (activity, context) => (
        activityRunner.start(activity, context)
      ),
      cancelActivity: (_activity, reason) => activityRunner.cancel(reason),
      telephoneRuntime,
      motionCueRuntime,
    }),
  });
  let controller;
  const dialoguePresenter = createScriptEventDialoguePresenter({
    root: dom.dialogueOverlay,
    speaker: dom.dialogueSpeaker,
    sourceText: dom.dialogueSource,
    japaneseText: dom.dialogueJapanese,
    options: dom.dialogueOptions,
    audioSettings: dialogueAudio,
    onAdvance: () => controller?.advanceLine(),
    onSelect: optionId => controller?.selectOption(optionId),
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
