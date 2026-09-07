import { PlayMusicDirector } from "../audio/MusicDirector.js";
import {
  subscribeToUserActivation,
} from "../audio/UserActivation.js";

const DEFAULT_MUSIC_VOLUME = 0.55;

export class MusicControls {
  constructor({
    dom,
    manifestUrl = "/music/manifest.json",
    fetchManifest = (url) => fetch(url),
    directorFactory = (options) => new PlayMusicDirector(options),
    masterMuted = false,
    overallVolume = 1,
    subscribeUserActivation = subscribeToUserActivation,
  }) {
    this.dom = dom;
    this.manifestUrl = manifestUrl;
    this.fetchManifest = fetchManifest;
    this.director = directorFactory({
      onStateChange: (musicState) => this.render(musicState),
      masterMuted,
      overallVolume,
    });
    this.initialized = false;
    this.disposed = false;
    this.subscribeUserActivation = subscribeUserActivation;
    this.unsubscribeUserActivation = null;
    this.onUnlock = () => {
      this.unsubscribeUserActivation?.();
      this.unsubscribeUserActivation = null;
      this.director.unlock();
    };
    this.onVolumeInput = () => {
      this.director.setVolume(this.dom.musicVolume.value);
    };
    this.onMutedChange = () => {
      this.director.setMuted(this.dom.musicMuted.checked);
    };
    this.render(this.director.getState());
  }

  async initialize() {
    if (this.initialized || this.disposed) return;
    this.initialized = true;
    this.dom.musicVolume.addEventListener("input", this.onVolumeInput);
    this.dom.musicMuted.addEventListener("change", this.onMutedChange);
    this.unsubscribeUserActivation = this.subscribeUserActivation(
      this.onUnlock,
    );
    try {
      const response = await this.fetchManifest(this.manifestUrl);
      if (!response.ok) {
        throw new Error(`music manifest returned HTTP ${response.status}`);
      }
      const manifest = await response.json();
      if (this.disposed) return;
      this.director.setManifest(manifest);
    } catch (error) {
      if (this.disposed) return;
      console.warn("[Music] music assets are unavailable", error);
      this.dom.musicVolume.disabled = true;
      this.dom.musicMuted.disabled = true;
      this.dom.musicControls.title = "Background music is unavailable";
    }
  }

  setWorld(worldId, options) {
    if (!this.disposed) this.director.setWorld(worldId, options);
  }

  playTemporaryTrack(trackId, options) {
    if (this.disposed) return false;
    return this.director.playTemporaryTrack(trackId, options);
  }

  stopTemporaryTrack(trackId) {
    if (this.disposed) return false;
    return this.director.stopTemporaryTrack(trackId);
  }

  setPlaybackPaused(paused) {
    if (this.disposed) return false;
    return this.director.setPlaybackPaused(paused);
  }

  setMasterMuted(muted) {
    this.director.setMasterMuted(muted);
  }

  setOverallVolume(value) {
    this.director.setOverallVolume(value);
  }

  reset() {
    this.director.setVolume(DEFAULT_MUSIC_VOLUME);
    this.director.setMuted(false);
  }

  render(musicState) {
    this.dom.musicVolume.value = String(musicState.volume);
    this.dom.musicMuted.checked = musicState.muted;
  }

  removeUnlockListeners() {
    this.unsubscribeUserActivation?.();
    this.unsubscribeUserActivation = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.removeUnlockListeners();
    this.dom.musicVolume.removeEventListener("input", this.onVolumeInput);
    this.dom.musicMuted.removeEventListener("change", this.onMutedChange);
    this.director.dispose();
  }
}
