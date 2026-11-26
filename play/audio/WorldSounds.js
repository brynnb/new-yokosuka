import { createGameAudio } from "./MediaElementAudio.js";
import {
  audioPreferences,
  effectiveEffectsVolume,
} from "./AudioPreferences.js";
import { applyMediaElementAudio } from "./MediaElementAudio.js";
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
    this.activeAudio = new Map();
    this.persistentAudio = new Map();
    this.unsubscribe = preferences.subscribe?.(state => {
      for (const collection of [this.activeAudio, this.persistentAudio]) {
        for (const [audio, voice] of collection) this.applyMix(audio, state, voice.gain);
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
        actorStepRecord: this.movement.nativeActorStepRecord,
        browserX: this.movement.position?.x,
        browserZ: this.movement.position?.z,
        fallbackSurfaceIndex: this.surfaceIndexForTerrain(
          this.movement.terrain,
        ),
      })
      : this.surfaceIndexForTerrain(this.movement.terrain);
    // Original STEP byte +1 silences the callback before material selection.
    if (surfaceIndex === null) return false;
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
    const gain = this.spatialGain(position, {
      referenceDistance,
      maxDistance,
    });
    const directory = bank
      ? `/audio/world/${bank.toLowerCase()}`
      : "/audio/world";
    return this.playAsset(`${directory}/${commandHex.toLowerCase()}.${extension}`, {
      gain, persistAcrossWorld,
    });
  }

  applyMix(audio, state, gain) {
    applyMediaElementAudio(audio, {
      muted: state.masterMuted || state.effectsMuted,
      volume: effectiveEffectsVolume(state) * (state.overallVolume ?? 1) * gain,
    });
  }

  // Each clip has its own media player and cancellation listener. A retained
  // scene passes the same signal across cuts, so an effect can ring into the
  // next shot while another cue plays.
  playAsset(source, { gain = 1, persistAcrossWorld = false, signal } = {}) {
    const state = this.preferences.getState();
    if (signal?.aborted || state.masterMuted || state.effectsMuted || gain <= 0) return false;
    const audio = this.audioFactory(source.replace(/^public\//, "/"));
    this.applyMix(audio, state, gain);
    const collection = persistAcrossWorld ? this.persistentAudio : this.activeAudio;
    const release = () => {
      collection.delete(audio);
      signal?.removeEventListener("abort", stop);
      audio.removeEventListener?.("ended", release);
      audio.removeEventListener?.("error", release);
    };
    const stop = () => {
      release();
      audio.pause?.();
    };
    collection.set(audio, { gain, stop });
    audio.addEventListener?.("ended", release);
    audio.addEventListener?.("error", release);
    signal?.addEventListener("abort", stop, { once: true });
    try {
      audio.play()?.catch?.(release);
    } catch {
      release();
      return false;
    }
    return true;
  }

  reset({ stopPersistent = false } = {}) {
    this.movement = null;
    for (const voice of this.activeAudio.values()) voice.stop();
    if (stopPersistent) {
      for (const voice of this.persistentAudio.values()) voice.stop();
    }
  }
}
