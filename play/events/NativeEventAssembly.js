// Browser adapters for native room scripts: player presentation, actor
// bindings, transactions, and event execution share the same scene state.
import {
  createNativeEventCameraRuntime,
  nativeEventCameraBrowserFrame,
  nativeProgramUsesEventCamera,
} from "./NativeEventCameraRuntime.js";
import nativeEventProgramIndex from "../data/events/nativeEventProgramIndex.generated.json" with {
  type: "json",
};
import { nativeFloat32Word } from "./NativeEventNumericRuntime.js";
import {
  createNativePlayerScriptedMotionRuntime,
} from "./NativePlayerScriptedMotionRuntime.js";
import { createNativePlayerXmptRuntime } from "./NativePlayerXmptRuntime.js";
import { createNativeRoomMusicRuntime } from "./NativeRoomMusicRuntime.js";
import { browserYawToNativeRaw } from "./NativeScriptedInteractionGate.js";

import { nativeClockRecordFromGameDate } from "./NativeClockRecordRuntime.js";
import { createNativeRoomScriptRuntime } from "./NativeRoomScriptRuntime.js";
import { dispatchNativeRoomSoundCommand } from "./NativeRoomSoundCommands.js";

import { createNativeEventProgramSource } from "./NativeEventProgramSource.js";
import {
  createNativeScriptedEventRuntime,
} from "./NativeScriptedEventRuntime.js";


export function createNativePlayerSceneAssembly({
  getAnimation,
  actorRoot,
  getController,
  getRoomScripts,
  camera,
  vectorFromArray,
  musicControls,
}) {
  const playerMotion = createNativePlayerScriptedMotionRuntime({ getAnimation });
  const syncMomtState = () => {
    const roomScripts = getRoomScripts();
    const words = playerMotion.readMomtNumericWords();
    if (words) {
      roomScripts.sceneState.configureActorMomtNumericQueryState({
        objectTag: "AKIR",
        actorAvailable: true,
        momtAvailable: true,
        ...words,
      });
    }
    const offset = playerMotion.readMomtScaledOffsetWords();
    if (offset && actorRoot.parent === null) {
      roomScripts.sceneState.configureActorMomtScaledOffsetState({
        objectTag: "AKIR",
        actorAvailable: true,
        momtAvailable: true,
        ...offset,
        positionWords: [
          nativeFloat32Word(Math.fround(-actorRoot.position.x)),
          nativeFloat32Word(Math.fround(actorRoot.position.y)),
          nativeFloat32Word(Math.fround(actorRoot.position.z)),
        ],
        parentTransform: null,
      });
    }
    return Boolean(words && offset);
  };
  const playerXmpt = createNativePlayerXmptRuntime({
    getAnimation,
    transferMotionOwnership: () => playerMotion.releaseForControllerTransfer(),
    readNativeTransform: () => ({
      position: [
        Math.fround(-actorRoot.position.x),
        Math.fround(actorRoot.position.y),
        Math.fround(actorRoot.position.z),
      ],
      facingRaw: browserYawToNativeRaw(actorRoot.rotation.y),
    }),
    writeNativeTransform: ({ position, facingRaw }) => {
      if (
        !Array.isArray(position)
        || position.length !== 3
        || position.some(value => !Number.isFinite(value))
        || !Number.isInteger(facingRaw)
      ) return false;
      actorRoot.position.set(-position[0], position[1], position[2]);
      actorRoot.rotation.y = -(
        (facingRaw & 0xffff) * Math.PI * 2 / 0x10000
      );
      const controller = getController();
      controller?.collider?.position.copyFrom(actorRoot.position);
      return true;
    },
  });

  let cameraSnapshot = null;
  const captureCamera = () => {
    if (cameraSnapshot) {
      throw new Error("another native camera presentation is active");
    }
    cameraSnapshot = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      fov: camera.fov,
    };
  };
  const restoreCamera = () => {
    if (!cameraSnapshot) return false;
    camera.position.set(...cameraSnapshot.position);
    camera.rotation.set(...cameraSnapshot.rotation);
    camera.fov = cameraSnapshot.fov;
    cameraSnapshot = null;
    return true;
  };
  const eventCamera = createNativeEventCameraRuntime({
    programIndex: nativeEventProgramIndex,
    applyNativeFrame: frame => {
      const browserFrame = nativeEventCameraBrowserFrame(frame);
      if (!browserFrame || browserFrame.perspectiveRadians === null) {
        return false;
      }
      camera.position.set(...browserFrame.position);
      camera.setTarget(vectorFromArray(browserFrame.target));
      camera.rotation.z = browserFrame.rollRadians;
      camera.fov = browserFrame.perspectiveRadians;
      return true;
    },
    releaseNativeFrame: restoreCamera,
  });
  const roomMusic = createNativeRoomMusicRuntime({
    playTemporaryTrack: (trackId, options) => (
      musicControls.playTemporaryTrack(trackId, options)
    ),
    stopTemporaryTrack: trackId => musicControls.stopTemporaryTrack(trackId),
  });

  return {
    playerMotion,
    syncMomtState,
    playerXmpt,
    eventCamera,
    roomMusic,
    cameraPresentation: {
      begin: captureCamera,
      abort: restoreCamera,
      captureForProgram(program) {
        const usesEventCamera = nativeProgramUsesEventCamera(program);
        // A new room transaction starts a fresh camera snapshot, including
        // clearing a previous snapshot when this program has no camera track.
        cameraSnapshot = null;
        if (usesEventCamera) captureCamera();
        return usesEventCamera;
      },
      clear() {
        cameraSnapshot = null;
      },
    },
  };
}

export function createNativeRoomScriptAssembly({
  scheduledActors,
  currentGameDate,
  sceneResourceRegistry,
  cutsceneActivityAdapter,
  mapClipState,
  mapRenderPreparationState,
  cutsceneDirector,
  selectedObjectActionController,
  eventCamera,
  playerMotion,
  syncPlayerMomtState,
  playerXmpt,
  actorLookPoint,
  worldSounds,
  roomMusic,
  freeConversationState,
  getController,
  cameraPresentation,
  randomFloat = Math.random,
}) {
  let roomScripts;
  roomScripts = createNativeRoomScriptRuntime({
    randomFloat,
    actorField: {
      resolveActorFieldState: ({ actorTag }) => ({
        actorAvailable: actorTag === "AKIR"
          || Boolean(scheduledActors.dialogueActor(actorTag)),
      }),
      resolveObjectFieldState: ({ objectTag }) => ({
        actorAvailable: objectTag === "AKIR"
          || Boolean(scheduledActors.dialogueActor(objectTag)),
      }),
    },
    actorController: {
      resolveActorControllerState: ({ actorTag }) => {
        const actorAvailable = actorTag === "AKIR"
          || Boolean(scheduledActors.dialogueActor(actorTag));
        return { actorAvailable, controllerAvailable: actorAvailable };
      },
    },
    associatedRecord: {
      resolveActorMomtByte6fState: ({ objectTag, query }) => {
        const actorAvailable = Boolean(
          scheduledActors.dialogueActor(objectTag),
        );
        if (query && actorAvailable) return null;
        return { actorAvailable, momtAvailable: actorAvailable };
      },
    },
    clockRecord: {
      readNativeClockRecord: () => nativeClockRecordFromGameDate(
        currentGameDate(),
      ),
    },
    operation013c: sceneResourceRegistry.adapter(),
    motionResource: sceneResourceRegistry.adapter(),
    scrollResource: sceneResourceRegistry.adapter(),
    operation0050: cutsceneActivityAdapter,
    operation0120: {
      applyRecordState: ({ records }) => mapClipState.applyNativeRecords(records),
    },
    operation0166: sceneResourceRegistry.adapter(),
    operation0170: mapRenderPreparationState.adapter(),
    presentationOwner: {
      resolveCurrentPresentationOwner: value => (
        cutsceneDirector.resolveProgramActorReference(value)
      ),
    },
    taggedObjectAction: {
      executeTaggedObjectAction: detail => (
        selectedObjectActionController.execute(detail)
      ),
    },
    scriptedScene: {
      requestEventCamera: detail => eventCamera.requestCamera(detail),
      selectCameraMode: detail => eventCamera.selectMode(detail),
      requestActorMotion: detail => {
        const accepted = playerMotion.requestMotion(detail);
        if (accepted) syncPlayerMomtState();
        return accepted;
      },
      readActorMotionStatus: detail => playerMotion.readMotionStatus(detail),
      readActorControllerStatus: detail => (
        cutsceneDirector.ownsProgramActor(detail.actorCode)
          ? 0
          : playerMotion.readControllerStatus(detail)
      ),
      writeActorControllerFlagBit3: detail => {
        const presentationAccepted = cutsceneDirector
          .ownsProgramActor(detail.actorCode)
          || playerMotion.writeControllerFlagBit3(detail);
        const sceneAccepted = roomScripts.sceneState
          .writeActorControllerFlagBit3({
            actorTag: detail.actorCode,
            enabled: detail.enabled,
          });
        return presentationAccepted && Boolean(sceneAccepted);
      },
      requestActorXmpt: detail => {
        roomScripts.sceneState.requestActorXmpt({
          actorTag: detail.actorCode,
          target: detail.target,
          requestWord: detail.requestWord,
          requestDword: detail.requestDword,
          stateSelector: detail.stateSelector,
        });
        return true;
      },
      readActorXmptStateZero: ({ actorCode }) => (
        roomScripts.sceneState.readActorXmptStateZero(actorCode)
      ),
      controlActorLookPoint: actorLookPoint,
      dispatchSoundCommand: detail => dispatchNativeRoomSoundCommand({
        ...detail,
        area: roomScripts.activeArea,
        routes: cutsceneDirector.activeProgramSoundCommands(),
        soundBankSlots: roomScripts.sceneState.readNativeSoundBankSlots(),
        playCommand: (commandHex, options) => (
          worldSounds.playCommand(commandHex, options)
        ),
        playMusicTrack: trackId => roomMusic.playSequence(trackId),
      }),
      freeConversationState,
    },
    transaction: createTransactionAdapter({
      getRoomScripts: () => roomScripts,
      eventCamera,
      playerMotion,
      playerXmpt,
      syncPlayerMomtState,
      mapClipState,
      mapRenderPreparationState,
      roomMusic,
      getController,
      cameraPresentation,
    }),
  });
  return roomScripts;
}

function createTransactionAdapter({
  getRoomScripts,
  eventCamera,
  playerMotion,
  playerXmpt,
  syncPlayerMomtState,
  mapClipState,
  mapRenderPreparationState,
  roomMusic,
  getController,
  cameraPresentation,
}) {
  return {
    begin: detail => {
      const usesEventCamera = cameraPresentation
        .captureForProgram(detail.program);
      let eventCameraTransaction;
      let motionTransaction;
      let xmptTransaction;
      let mapClipTransaction;
      let renderPreparationTransaction;
      let musicTransaction;
      try {
        eventCameraTransaction = usesEventCamera
          ? eventCamera.beginTransaction(detail)
          : null;
        motionTransaction = playerMotion.beginTransaction();
        xmptTransaction = playerXmpt.beginTransaction();
        mapClipTransaction = mapClipState.beginTransaction();
        renderPreparationTransaction = mapRenderPreparationState
          .beginTransaction();
        musicTransaction = roomMusic.beginTransaction();
        const movementLocked = Boolean(getController()?.movementLocked);
        getController()?.setMovementLocked(true);
        return {
          eventCamera: eventCameraTransaction,
          playerMotion: motionTransaction,
          playerXmpt: xmptTransaction,
          nativeMapClip: mapClipTransaction,
          nativeMapRenderPreparation: renderPreparationTransaction,
          nativeMusic: musicTransaction,
          movementLocked,
        };
      } catch (error) {
        if (musicTransaction) roomMusic.endTransaction(musicTransaction);
        try {
          if (mapClipTransaction) {
            mapClipState.rollbackTransaction(mapClipTransaction);
          }
        } finally {
          if (renderPreparationTransaction) {
            mapRenderPreparationState.rollbackTransaction(
              renderPreparationTransaction,
            );
          }
        }
        if (xmptTransaction) playerXmpt.rollbackTransaction(xmptTransaction);
        if (motionTransaction) {
          playerMotion.rollbackTransaction(motionTransaction);
        }
        if (eventCameraTransaction) {
          eventCamera.rollbackTransaction(eventCameraTransaction);
        }
        cameraPresentation.clear();
        throw error;
      }
    },
    update: ({ external, deltaSeconds }) => {
      getController()?.setMovementLocked(true);
      const roomScripts = getRoomScripts();
      const authActivity = roomScripts.sceneState
        .readNativeOperation0050Activity();
      if (authActivity) return;
      if (external.eventCamera) eventCamera.update(deltaSeconds);
      syncPlayerMomtState();
      playerXmpt.update(deltaSeconds);
      const xmpt = roomScripts.sceneState.readActorXmptState("AKIR");
      if (xmpt) {
        roomScripts.sceneState.updateActorXmpt("AKIR", playerXmpt.controller());
      }
    },
    commit: ({ external }) => {
      if (external.eventCamera) {
        eventCamera.commitTransaction(external.eventCamera);
      }
      cameraPresentation.clear();
      try {
        roomMusic.endTransaction(external.nativeMusic);
        playerXmpt.commitTransaction(external.playerXmpt);
        playerMotion.commitTransaction(external.playerMotion);
        try {
          mapClipState.commitTransaction(external.nativeMapClip);
        } finally {
          mapRenderPreparationState.commitTransaction(
            external.nativeMapRenderPreparation,
          );
        }
        return true;
      } finally {
        getController()?.setMovementLocked(external.movementLocked);
      }
    },
    rollback: ({ external }) => {
      try {
        roomMusic.endTransaction(external.nativeMusic);
      } finally {
        try {
          if (external.eventCamera) {
            eventCamera.rollbackTransaction(external.eventCamera);
          }
        } finally {
          cameraPresentation.clear();
          try {
            playerXmpt.rollbackTransaction(external.playerXmpt);
          } finally {
            try {
              playerMotion.rollbackTransaction(external.playerMotion);
            } finally {
              try {
                try {
                  mapClipState.rollbackTransaction(external.nativeMapClip);
                } finally {
                  mapRenderPreparationState.rollbackTransaction(
                    external.nativeMapRenderPreparation,
                  );
                }
              } finally {
                getController()?.setMovementLocked(external.movementLocked);
              }
            }
          }
        }
      }
      return true;
    },
  };
}

export function createNativeScriptedEventAssembly({
  dialoguePersistence,
  dialogueOverlay,
  freeConversationState,
  roomScripts,
  actorTags,
  actorRoot,
  getActivityRunner,
  persistDialogueMutation,
  addSystemMessage,
  localDebug = false,
}) {
  const configurePlayerSceneState = () => {
    roomScripts.sceneState.configureObjectMapcRecord({
      objectTag: "AKIR",
      objectAvailable: true,
      recordAvailable: false,
    });
    roomScripts.sceneState.configureActorOsagState({
      actorTag: "AKIR",
      available: true,
      osagNodeBytes: null,
      controllerFlagByte: 0x08,
    });
    roomScripts.sceneState.configureActorMomtByte6fState({
      objectTag: "AKIR",
      actorAvailable: true,
      momtAvailable: true,
      value: 0,
    });
    roomScripts.sceneState.configureActorMomtFlagState({
      objectTag: "AKIR",
      actorAvailable: true,
      momtAvailable: true,
      flagsWord: 0,
    });
    for (const actorTag of actorTags) {
      roomScripts.sceneState.configureActorFaceClipControl({
        actorTag,
        actorAvailable: true,
        momtAvailable: true,
        faceAvailable: true,
        clipAvailable: true,
      });
    }
  };
  const configureDialogueState = () => {
    freeConversationState.configureDialogueState(
      dialoguePersistence.gameplayState()?.dialogueState,
    );
  };

  return createNativeScriptedEventRuntime({
    programSource: createNativeEventProgramSource({
      index: nativeEventProgramIndex,
    }),
    onStarted: identity => {
      if (localDebug) console.info("[Script started]", identity);
    },
    getActorByteState: () => (
      dialoguePersistence.gameplayState()?.actorByteState
    ),
    createProbe: () => {
      configureDialogueState();
      configurePlayerSceneState();
      roomScripts.writeSceneObjectBasePosition({
        objectTag: "AKIR",
        nativePosition: [
          Math.fround(-actorRoot.position.x),
          Math.fround(actorRoot.position.y),
          Math.fround(actorRoot.position.z),
        ],
      });
      return {
        context: roomScripts.eventContext(),
        handlers: roomScripts.semanticHandlers(),
      };
    },
    createExecution: detail => {
      configureDialogueState();
      const execution = roomScripts.beginTransaction(detail);
      try {
        configurePlayerSceneState();
        if (Array.isArray(detail.gate?.nativePosition)) {
          roomScripts.writeInteractionActorPosition(detail.gate.nativePosition);
        }
        const actorPosition = detail.context?.selectedActorNativePosition;
        if (
          Array.isArray(actorPosition)
          && actorPosition.length === 3
          && actorPosition.every(Number.isFinite)
        ) {
          roomScripts.sceneState.configureActorLookPointState({
            actorTag: detail.actorCode,
            actorAvailable: true,
            controllerAvailable: true,
            defaultVector: actorPosition.map(nativeFloat32Word),
          });
        }
        const selectedRecordIndex = detail.route?.nativeSpatialRecordIndex;
        if (Number.isSafeInteger(selectedRecordIndex)) {
          roomScripts.writeSpatialSelection({ selectedRecordIndex });
          roomScripts.consumeSpatialSelection({ selectedRecordIndex });
        }
      } catch (error) {
        execution.rollback({ reason: "spatial-selector-initialization-failed" });
        throw error;
      }
      return execution;
    },
    onDialogueRequest: request => dialogueOverlay.start({
      kind: "scripted",
      actorCode: request.actorCode,
      voiceIds: request.voiceIds,
      source: request.source,
      sceneActor: request.sceneActor,
    }),
    onComplete: () => {
      if (!getActivityRunner()?.active) persistDialogueMutation();
    },
    onStopped: (result) => {
      console.warn("Native scripted event stopped:", result);
      dialoguePersistence.rollback();
      dialogueOverlay.stop("scripted-event-stopped");
      addSystemMessage(
        "That original scripted interaction is not supported completely yet.",
      );
    },
  });
}
