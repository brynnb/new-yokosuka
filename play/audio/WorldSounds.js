import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import {
  applyMediaElementAudio,
  setMediaElementMuted,
} from "./MediaElementAudio.js";
import {
  nativeFootstepSurfaceIndexAt,
} from "./NativeFootstepSurfaceResolver.js";
import {
  DEFAULT_FOOTSTEP_SURFACE_INDEX,
  packagedNativeFootstepCommand,
  validFootstepSurfaceIndex,
} from "./NativeFootstepCommands.js";
import {
  D000_DOOR_AUDIO_BANK,
  nativeD000DoorOpeningCommand,
} from "./NativeDoorCommands.js";
import {
  JOMO_OBJECT_AUDIO_BANK,
  nativeJomoDrawerPhaseCommand,
} from "./NativeJomoObjectCommands.js";
import {
  JOMO_DOOR_AUDIO_BANK,
  nativeJomoDoorPhaseCommand,
} from "./NativeJomoDoorCommands.js";
export {
  DEFAULT_FOOTSTEP_SURFACE_INDEX,
  NATIVE_FOOTSTEP_SURFACE_COMMANDS,
  nativeFootstepCommand,
} from "./NativeFootstepCommands.js";

export function footstepSurfaceIndexForTerrain(terrain) {
  return validFootstepSurfaceIndex(
    terrain?.mesh?.metadata?.nativeFootstepSurfaceIndex
      ?? terrain?.mesh?.parent?.metadata?.nativeFootstepSurfaceIndex,
  ) ?? DEFAULT_FOOTSTEP_SURFACE_INDEX;
}

export class WorldSounds {
  constructor({
    audioFactory = (source) => createGameAudio(source),
    preferences = audioPreferences,
    random = Math.random,
    surfaceIndexForTerrain = footstepSurfaceIndexForTerrain,
    surfaceIndexAt = nativeFootstepSurfaceIndexAt,
  } = {}) {
    this.audioFactory = audioFactory;
    this.preferences = preferences;
    this.random = random;
    this.surfaceIndexForTerrain = surfaceIndexForTerrain;
    this.surfaceIndexAt = surfaceIndexAt;
    this.movement = null;
    this.activeAudio = new Set();
    this.persistentAudio = new Set();
    this.unsubscribe = preferences.subscribe?.((state) => {
      const muted = state.masterMuted || state.effectsMuted;
      for (const audio of this.activeAudio) setMediaElementMuted(audio, muted);
      for (const audio of this.persistentAudio) {
        setMediaElementMuted(audio, muted);
      }
    }) || null;
  }

  setMovement(movement) {
    this.movement = movement;
  }

  handleActionCue(event) {
    if (event?.type === "nativeSound") {
      const commandHex = event.cue?.commandHex;
      const bank = event.cue?.bank;
      if (
        !/^[0-9a-f]{8}$/i.test(commandHex || "")
        || !/^[a-z0-9_]+$/i.test(bank || "")
      ) {
        return false;
      }
      return this.playCommand(commandHex, {
        bank,
        position: this.movement?.position,
        referenceDistance: 1.5,
        maxDistance: 14,
      });
    }
    if (
      event?.type !== "surfaceSound"
      || !this.movement?.moving
      || this.movement.movementLocked
      || this.movement.noClip
      || !this.movement.terrain
    ) {
      return false;
    }
    if (this.preferences.getState().footstepsMuted) return false;
    const surfaceIndex = this.movement.nativeArea
      ? this.surfaceIndexAt({
        area: this.movement.nativeArea,
        actorTag: this.movement.nativeActorTag,
        browserX: this.movement.position?.x,
        browserZ: this.movement.position?.z,
        fallbackSurfaceIndex: this.surfaceIndexForTerrain(
          this.movement.terrain,
        ),
      })
      : this.surfaceIndexForTerrain(this.movement.terrain);
    // FUN_0c17bb14 uses the engine RNG for contact kinds 0..5. Ryo's
    // authored walk/run cues are kinds 0/1 and 3/4 respectively.
    const variant = event.cue?.contactKind === 6
      || event.cue?.contactKind === 7
      ? 0
      : Math.floor(Math.max(0, Math.min(0.999999, this.random())) * 4);
    return this.playCommand(packagedNativeFootstepCommand({
      surfaceIndex,
      variant,
    }));
  }

  handleInteractionCue(event) {
    if (event?.type === "nativeD000DoorOpening") {
      const commandHex = nativeD000DoorOpeningCommand(event.doorSelector);
      if (!commandHex) return false;
      return this.playCommand(commandHex, {
        bank: D000_DOOR_AUDIO_BANK,
        position: event.position,
        referenceDistance: 1.5,
        maxDistance: 14,
      });
    }
    if (event?.type === "nativeJomoDrawerPhase") {
      const commandHex = nativeJomoDrawerPhaseCommand(
        event.objectTag,
        event.phase,
      );
      if (!commandHex) return false;
      return this.playCommand(commandHex, {
        bank: JOMO_OBJECT_AUDIO_BANK,
        position: event.position,
        referenceDistance: 1.5,
        maxDistance: 14,
      });
    }
    if (event?.type === "nativeJomoDoorPhase") {
      const commandHex = nativeJomoDoorPhaseCommand(
        event.model,
        event.phase,
      );
      if (!commandHex) return false;
      return this.playCommand(commandHex, {
        bank: JOMO_DOOR_AUDIO_BANK,
        position: event.position,
        referenceDistance: 1.5,
        maxDistance: 14,
      });
    }
    return false;
  }

  spatialGain(position, {
    referenceDistance = 1,
    maxDistance = 12,
  } = {}) {
    const listener = this.movement?.position;
    if (
      !position
      || !listener
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.z)
      || !Number.isFinite(listener.x)
      || !Number.isFinite(listener.z)
    ) {
      return 1;
    }
    const distance = Math.hypot(
      position.x - listener.x,
      position.z - listener.z,
    );
    if (distance >= maxDistance) return 0;
    const safeReference = Math.max(0.01, referenceDistance);
    return Math.min(
      1,
      safeReference / Math.max(safeReference, distance),
    );
  }

  playCommand(commandHex, {
    bank = null,
    extension = "webm",
    position = null,
    referenceDistance,
    maxDistance,
    persistAcrossWorld = false,
  } = {}) {
    if (!commandHex) return false;
    if (extension !== "webm" && extension !== "wav") return false;
    const state = this.preferences.getState();
    if (state.masterMuted || state.effectsMuted) return false;
    const gain = this.spatialGain(position, {
      referenceDistance,
      maxDistance,
    });
    if (gain <= 0) return false;
    const directory = bank
      ? `/audio/world/${bank.toLowerCase()}`
      : "/audio/world";
    const audio = this.audioFactory(
      `${directory}/${commandHex.toLowerCase()}.${extension}`,
    );
    applyMediaElementAudio(audio, {
      muted: false,
      volume: effectiveEffectsVolume(state)
        * (state.overallVolume ?? 1)
        * gain,
    });
    const collection = persistAcrossWorld
      ? this.persistentAudio
      : this.activeAudio;
    collection.add(audio);
    const release = () => collection.delete(audio);
    audio.addEventListener?.("ended", release, { once: true });
    audio.addEventListener?.("error", release, { once: true });
    const playback = audio.play();
    playback?.catch?.(release);
    return true;
  }

  reset({ stopPersistent = false } = {}) {
    this.movement = null;
    for (const audio of this.activeAudio) audio.pause?.();
    this.activeAudio.clear();
    if (stopPersistent) {
      for (const audio of this.persistentAudio) audio.pause?.();
      this.persistentAudio.clear();
    }
  }
}
