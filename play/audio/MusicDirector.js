import { applyMediaElementAudio } from "./MediaElementAudio.js";

export const PLAY_MUSIC_VOLUME_STORAGE_KEY = "new-yokosuka.music-volume";
export const PLAY_MUSIC_MUTED_STORAGE_KEY = "new-yokosuka.music-muted";

const DEFAULT_VOLUME = 0.55;
const DEFAULT_CROSSFADE_MS = 1200;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

export function readMusicPreferences(storage = globalThis.localStorage) {
  let volume = DEFAULT_VOLUME;
  let muted = false;
  try {
    const savedValue = storage?.getItem(PLAY_MUSIC_VOLUME_STORAGE_KEY);
    const savedVolume = Number(savedValue);
    if (savedValue !== null && Number.isFinite(savedVolume)) {
      volume = clamp(savedVolume);
    }
    muted = storage?.getItem(PLAY_MUSIC_MUTED_STORAGE_KEY) === "1";
  } catch {
    // Storage is optional.
  }
  return { volume, muted };
}

function savePreference(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage is optional.
  }
}

export class PlayMusicDirector {
  constructor({
    audioFactory = () => new Audio(),
    storage = globalThis.localStorage,
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
    now = () => performance.now(),
    crossfadeMs = DEFAULT_CROSSFADE_MS,
    onStateChange = () => {},
    masterMuted = false,
    overallVolume = 1,
    initialVolume = null,
    initialMuted = null,
    persistPreferences = true,
    audioLabel = "Music",
  } = {}) {
    const preferences = persistPreferences
      ? readMusicPreferences(storage)
      : {
        volume: initialVolume === null ? DEFAULT_VOLUME : clamp(initialVolume),
        muted: initialMuted === null ? false : Boolean(initialMuted),
      };
    this.audioFactory = audioFactory;
    this.storage = storage;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.now = now;
    this.crossfadeMs = Math.max(0, crossfadeMs);
    this.onStateChange = onStateChange;
    this.persistPreferences = persistPreferences;
    this.audioLabel = audioLabel;
    this.volume = preferences.volume;
    this.muted = preferences.muted;
    this.masterMuted = Boolean(masterMuted);
    this.overallVolume = clamp(overallVolume);
    this.manifest = null;
    this.worldId = null;
    this.unlocked = false;
    this.playbackPaused = false;
    this.current = null;
    this.outgoing = null;
    this.fadeHandle = null;
    this.fadeRevision = 0;
  }

  setManifest(manifest) {
    if (!manifest?.tracks || !manifest?.worlds) {
      throw new Error("Music manifest is missing tracks or worlds.");
    }
    for (const [worldId, assignment] of Object.entries(manifest.worlds)) {
      if (!manifest.tracks[assignment.track]) {
        throw new Error(
          `Music world ${worldId} references missing track ${assignment.track}.`,
        );
      }
    }
    this.manifest = manifest;
    this.#syncWorld();
    this.#emitState();
  }

  setWorld(worldId, { preserveTemporary = false } = {}) {
    this.worldId = worldId;
    this.#syncWorld({ interruptTemporary: !preserveTemporary });
    this.#emitState();
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.#syncWorld();
    this.#emitState();
  }

  setVolume(value) {
    this.volume = clamp(value);
    if (this.persistPreferences) {
      savePreference(
        this.storage,
        PLAY_MUSIC_VOLUME_STORAGE_KEY,
        String(this.volume),
      );
    }
    this.#applyCurrentVolume();
    this.#emitState();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.persistPreferences) {
      savePreference(
        this.storage,
        PLAY_MUSIC_MUTED_STORAGE_KEY,
        this.muted ? "1" : "0",
      );
    }
    this.#applyCurrentVolume();
    this.#emitState();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  setMasterMuted(muted) {
    this.masterMuted = Boolean(muted);
    this.#applyCurrentVolume();
    this.#emitState();
  }

  setOverallVolume(value) {
    this.overallVolume = clamp(value);
    this.#applyCurrentVolume();
    this.#emitState();
  }

  setPlaybackPaused(paused) {
    const next = Boolean(paused);
    if (this.playbackPaused === next) return true;
    this.playbackPaused = next;
    for (const entry of [this.current, this.outgoing]) {
      if (!entry) continue;
      if (next) {
        entry.audio.pause();
        continue;
      }
      const playResult = entry.audio.play();
      playResult?.catch?.((error) => {
        console.warn(`[${this.audioLabel}] playback could not resume`, error);
      });
    }
    this.#emitState();
    return true;
  }

  playTemporaryTrack(trackId, { gain = 1, loop = false } = {}) {
    if (!this.unlocked || !this.manifest) return false;
    const track = this.manifest.tracks[trackId];
    if (!track) return false;
    const next = this.#startTrack({
      track,
      trackId,
      gain: clamp(gain),
      loop: Boolean(loop),
      temporary: true,
    });
    if (!loop) {
      next.audio.onended = () => {
        if (this.current !== next) return;
        next.audio.onended = null;
        next.audio.pause();
        next.audio.removeAttribute?.("src");
        this.current = null;
        this.#syncWorld();
        this.#emitState();
      };
    }
    this.#emitState();
    return true;
  }

  stopTemporaryTrack(trackId = null) {
    if (
      !this.current?.temporary
      || (trackId !== null && this.current.trackId !== trackId)
    ) {
      return false;
    }
    this.current.audio.onended = null;
    this.current.audio.pause();
    this.current.audio.removeAttribute?.("src");
    this.current = null;
    this.#syncWorld();
    this.#emitState();
    return true;
  }

  stopTemporaryTrack(trackId = null) {
    if (
      !this.current?.temporary
      || (trackId && this.current.trackId !== trackId)
    ) return false;
    this.#stopPlayback();
    this.#syncWorld();
    this.#emitState();
    return true;
  }

  getState() {
    const assignment = this.manifest?.worlds?.[this.worldId] || null;
    const trackId = this.current?.trackId || assignment?.track || null;
    const track = trackId
      ? this.manifest.tracks[trackId]
      : null;
    return {
      unlocked: this.unlocked,
      volume: this.volume,
      muted: this.muted,
      masterMuted: this.masterMuted,
      overallVolume: this.overallVolume,
      worldId: this.worldId,
      trackId,
      label: track?.label || "Music unavailable",
      playing: Boolean(this.current),
      playbackPaused: this.playbackPaused,
    };
  }

  dispose() {
    this.fadeRevision++;
    if (this.fadeHandle !== null) this.cancelFrame(this.fadeHandle);
    this.fadeHandle = null;
    if (this.current) {
      this.current.audio.onended = null;
      this.current.audio.pause();
      this.current.audio.removeAttribute?.("src");
      this.current = null;
    }
    if (this.outgoing) {
      this.outgoing.audio.onended = null;
      this.outgoing.audio.pause();
      this.outgoing.audio.removeAttribute?.("src");
      this.outgoing = null;
    }
  }

  #syncWorld({ interruptTemporary = false } = {}) {
    if (!this.worldId) {
      this.#stopPlayback();
      return;
    }
    if (!this.unlocked || !this.manifest) return;
    if (this.current?.temporary && !interruptTemporary) return;
    const assignment = this.manifest.worlds[this.worldId];
    if (!assignment) {
      this.#stopPlayback();
      return;
    }
    const track = this.manifest.tracks[assignment.track];
    const gain = clamp(assignment.gain ?? 1);
    if (
      this.current?.trackId === assignment.track
      && !this.current.temporary
    ) {
      this.current.gain = gain;
      this.#applyCurrentVolume();
      return;
    }

    this.#startTrack({
      track,
      trackId: assignment.track,
      gain,
      loop: track.loop !== false,
      temporary: false,
    });
  }

  #stopPlayback() {
    this.fadeRevision++;
    if (this.fadeHandle !== null) this.cancelFrame(this.fadeHandle);
    this.fadeHandle = null;
    for (const entry of [this.current, this.outgoing]) {
      if (!entry) continue;
      entry.audio.onended = null;
      entry.audio.pause();
      entry.audio.removeAttribute?.("src");
    }
    this.current = null;
    this.outgoing = null;
  }

  #startTrack({
    track,
    trackId,
    gain,
    loop,
    temporary,
  }) {
    const audio = this.audioFactory();
    audio.preload = "auto";
    audio.loop = loop;
    audio.src = resolveRuntimeAssetUrl(track.url);
    applyMediaElementAudio(audio, {
      muted: this.muted || this.masterMuted,
      volume: 0,
    });
    const next = {
      audio,
      trackId,
      gain,
      temporary,
    };
    const previous = this.current;
    if (previous) previous.audio.onended = null;
    this.current = next;
    if (!this.playbackPaused) {
      const playResult = audio.play();
      playResult?.catch?.((error) => {
        console.warn(`[${this.audioLabel}] playback could not start`, error);
      });
    }
    this.#crossfade(previous, next);
    return next;
  }

  #targetVolume(entry) {
    return this.muted || this.masterMuted
      ? 0
      : clamp(this.volume * entry.gain * this.overallVolume);
  }

  #applyCurrentVolume() {
    if (this.current) {
      applyMediaElementAudio(this.current.audio, {
        muted: this.muted || this.masterMuted,
        volume: this.#targetVolume(this.current),
      });
    }
    if ((this.muted || this.masterMuted) && this.outgoing) {
      applyMediaElementAudio(this.outgoing.audio, { muted: true, volume: 0 });
    }
  }

  #crossfade(previous, next) {
    this.fadeRevision++;
    const revision = this.fadeRevision;
    if (this.fadeHandle !== null) this.cancelFrame(this.fadeHandle);
    if (this.outgoing && this.outgoing !== previous) {
      this.outgoing.audio.pause();
      this.outgoing.audio.removeAttribute?.("src");
    }
    this.outgoing = previous;
    const startedAt = this.now();
    const previousStart = previous?.audio.volume || 0;
    const previousTarget = previous ? this.#targetVolume(previous) : 0;
    const previousStartRatio = previousTarget > 0
      ? previousStart / previousTarget
      : 1;
    const step = () => {
      if (revision !== this.fadeRevision) return;
      const elapsed = this.now() - startedAt;
      const progress = this.crossfadeMs === 0
        ? 1
        : clamp(elapsed / this.crossfadeMs);
      applyMediaElementAudio(next.audio, {
        muted: this.muted || this.masterMuted,
        volume: this.#targetVolume(next) * progress,
      });
      if (previous) {
        applyMediaElementAudio(previous.audio, {
          muted: this.muted || this.masterMuted,
          volume: this.#targetVolume(previous)
            * previousStartRatio
            * (1 - progress),
        });
      }
      if (progress < 1) {
        this.fadeHandle = this.requestFrame(step);
        return;
      }
      this.fadeHandle = null;
      if (previous) {
        previous.audio.pause();
        previous.audio.removeAttribute?.("src");
      }
      if (this.outgoing === previous) this.outgoing = null;
      this.#emitState();
    };
    step();
  }

  #emitState() {
    this.onStateChange(this.getState());
  }
}
import { resolveRuntimeAssetUrl } from "../../src/RuntimeAssets.js";
