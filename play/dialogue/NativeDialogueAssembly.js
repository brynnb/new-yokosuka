import {
  createNativeDialogueActorRuntimeValueReader,
} from "./NativeDialogueActorRuntimeValue.js";
import {
  createNativeDialogueFacialPresentation,
} from "./NativeDialogueFacialPresentation.js";
import {
  createNativeDialogueOverlayRuntime,
} from "./NativeDialogueOverlayRuntime.js";
import {
  createNativeDialoguePersistence,
} from "./NativeDialoguePersistence.js";
import {
  createNativeDialogueSceneStaging,
} from "./NativeDialogueSceneStaging.js";
import {
  createNativeFreeConversationState,
} from "../events/NativeScriptedSceneRuntime.js";

export function createNativeDialogueAssembly({
  scheduledActors,
  networkState,
  getWorldId,
  saveSnapshot,
  addSystemMessage,
  getController,
  getScriptedEvents,
  dom,
  dialogueAudio,
  setControlsActive,
  transientNotice,
}) {
  const readActorRuntimeValue = createNativeDialogueActorRuntimeValueReader({
    networkState,
    getWorldId,
  });
  let overlay;
  const persistence = createNativeDialoguePersistence({
    saveSnapshot,
    onConflict: (_snapshot, error) => {
      console.warn(
        "Native dialogue progress was stale; reloaded server state.",
        error,
      );
      overlay.stop("persistence-conflict");
      addSystemMessage(
        "Dialogue progress was updated from the server. Please talk again.",
      );
    },
    onError: (error) => {
      console.error("Native dialogue progress could not be saved:", error);
      persistence.clear();
      overlay.stop("persistence-error");
      addSystemMessage(
        "Dialogue progress could not be saved. Refresh before talking again.",
      );
    },
  });
  const persistMutation = () => {
    void persistence.persistMutation().catch(() => {});
  };
  const sceneStaging = createNativeDialogueSceneStaging({ scheduledActors });
  const freeConversationState = createNativeFreeConversationState();
  const faces = createNativeDialogueFacialPresentation({ scheduledActors });

  overlay = createNativeDialogueOverlayRuntime({
    root: dom.dialogueOverlay,
    speaker: dom.dialogueSpeaker,
    sourceText: dom.dialogueSource,
    japaneseText: dom.dialogueJapanese,
    audioSettings: dialogueAudio,
    onMovementLockChanged: locked => (
      getController()?.setMovementLocked(locked)
    ),
    onActiveChanged: (active) => {
      setControlsActive(active);
      if (!active) {
        faces.stop();
        sceneStaging.end();
      }
    },
    onStarted: (_started, options) => {
      sceneStaging.begin(options.sceneActor);
    },
    onMessageStart: message => faces.start(message),
    onMessageEnd: message => faces.endMessage(message),
    onNativeCommand: dispatch => sceneStaging.handleNativeCommand(dispatch),
    onEvent: (event) => {
      console.warn("Native dialogue paused at an unimplemented event:", event);
      overlay.stop("unimplemented-native-event");
      getScriptedEvents()?.cancel("unimplemented-native-event");
      persistence.rollback();
      addSystemMessage("That scripted conversation event is not supported yet.");
    },
    onUnresolved: (result) => {
      console.warn("Native dialogue could not be resolved:", result);
      getScriptedEvents()?.cancel("dialogue-unresolved");
      persistence.rollback();
      transientNotice.show("This NPC has no dialogue.");
    },
    onComplete: (detail) => {
      if (detail.kind !== "session") return;
      if (detail.result?.kind === "scripted") {
        void getScriptedEvents()?.resumeDialogue();
        return;
      }
      persistMutation();
    },
    onStopped: ({ reason }) => getScriptedEvents()?.cancel(reason),
  });

  return {
    readActorRuntimeValue,
    persistence,
    persistMutation,
    sceneStaging,
    freeConversationState,
    faces,
    overlay,
  };
}
