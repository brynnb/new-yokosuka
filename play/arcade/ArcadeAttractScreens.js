import * as BABYLON from "@babylonjs/core";
import Hls from "hls.js";
import {
  loopedMediaTimeSeconds,
  shortestLoopTimeDifferenceSeconds,
} from "../../src/SynchronizedMediaTime.js";
import { applyMediaElementAudio } from "../audio/MediaElementAudio.js";

const DEFAULT_VOLUME = 0.18;
const DEFAULT_TV_VOLUME = 0.18;
const MIN_VOLUME_FRACTION = 0.25;
const FULL_VOLUME_DISTANCE = 1;
const MIN_VOLUME_DISTANCE = 7;
export const ARCADE_BG_VOLUME_STORAGE_KEY = (
  "new-yokosuka.arcade-background-volume"
);
export const ARCADE_BG_MUTED_STORAGE_KEY = (
  "new-yokosuka.arcade-background-muted"
);
export const TV_VOLUME_STORAGE_KEY = "new-yokosuka.tv-volume";
export const TV_MUTED_STORAGE_KEY = "new-yokosuka.tv-muted";

function clampVolume(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function arcadeCabinetScreenPoints(definition) {
  const normal = BABYLON.Vector3.FromArray(definition.frontNormal)
    .normalize()
    .scale(0.003);
  return [
    definition.bottomLeft,
    definition.bottomRight,
    definition.topRight,
    definition.topLeft,
  ].map((point) => BABYLON.Vector3.FromArray(point).add(normal));
}

function applyScreenGeometry(mesh, definition) {
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = arcadeCabinetScreenPoints(definition)
    .flatMap((point) => point.asArray());
  vertexData.indices = [0, 1, 2, 0, 2, 3];
  vertexData.uvs = definition.screenUvs
    ? [...definition.screenUvs]
    : (
      definition.reverseU === false
        ? [0, 0, 1, 0, 1, 1, 0, 1]
        : [1, 0, 0, 0, 0, 1, 1, 1]
    );
  vertexData.normals = [];
  BABYLON.VertexData.ComputeNormals(
    vertexData.positions,
    vertexData.indices,
    vertexData.normals,
  );
  vertexData.applyToMesh(mesh);
}

function attachVideoSource(video, definition) {
  const sourceUrl = definition.attractUrl;
  const fallbackUrl = definition.attractFallbackUrl;
  if (!/\.m3u8(?:$|[?#])/i.test(sourceUrl)) {
    video.src = sourceUrl;
    return null;
  }
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = sourceUrl;
    return null;
  }
  if (!Hls.isSupported()) {
    video.src = fallbackUrl || sourceUrl;
    return null;
  }

  const hls = new Hls({
    backBufferLength: 30,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });
  let fellBack = false;
  hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(sourceUrl));
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data?.fatal || fellBack) return;
    fellBack = true;
    hls.destroy();
    if (fallbackUrl) {
      video.src = fallbackUrl;
      video.load();
    }
  });
  hls.attachMedia(video);
  return hls;
}

export class ArcadeAttractScreens {
  constructor({
    scene,
    definitions,
    defaultWorldId,
    syncEpochMs,
    syncIntervalMs,
    maxDriftSeconds,
    getServerWallTimeMs,
    storage = globalThis.localStorage,
    masterMuted = false,
    overallVolume = 1,
  }) {
    this.scene = scene;
    this.definitions = definitions;
    this.defaultWorldId = defaultWorldId;
    this.syncEpochMs = syncEpochMs;
    this.syncIntervalMs = syncIntervalMs;
    this.maxDriftSeconds = maxDriftSeconds;
    this.getServerWallTimeMs = getServerWallTimeMs;
    this.storage = storage;
    this.volume = DEFAULT_VOLUME;
    this.muted = false;
    this.tvVolume = DEFAULT_TV_VOLUME;
    this.tvMuted = false;
    this.masterMuted = Boolean(masterMuted);
    this.overallVolume = clampVolume(overallVolume);
    try {
      const savedVolume = storage?.getItem(ARCADE_BG_VOLUME_STORAGE_KEY);
      if (savedVolume !== null) this.volume = clampVolume(savedVolume);
      this.muted = (
        storage?.getItem(ARCADE_BG_MUTED_STORAGE_KEY) === "1"
      );
      const savedTvVolume = storage?.getItem(TV_VOLUME_STORAGE_KEY);
      if (savedTvVolume !== null) {
        this.tvVolume = clampVolume(savedTvVolume);
      }
      this.tvMuted = storage?.getItem(TV_MUTED_STORAGE_KEY) === "1";
    } catch {
      // The current-session controls still work without persistent storage.
    }
    this.entries = new Map();
    this.performanceVideosEnabled = true;
    this.unlockListening = false;
    this.unlockPlayback = this.unlockPlayback.bind(this);
  }

  markClockChanged() {
    for (const entry of this.entries.values()) {
      entry.mediaTimeSynchronized = false;
    }
  }

  getAudioState() {
    return {
      volume: this.volume,
      muted: this.muted,
      tvVolume: this.tvVolume,
      tvMuted: this.tvMuted,
    };
  }

  getDebugState() {
    const entries = [...this.entries.values()];
    const videos = entries.filter((entry) => entry.video);
    return {
      screenCount: entries.length,
      enabledScreenCount: entries.filter(
        (entry) => entry.mesh?.isEnabled?.(),
      ).length,
      videoCount: videos.length,
      readyVideoCount: videos.filter(
        (entry) => (
          entry.video.readyState >= entry.video.HAVE_CURRENT_DATA
          && entry.texture?.isReady?.()
        ),
      ).length,
      playingVideoCount: videos.filter(
        (entry) => !entry.video.paused,
      ).length,
      blockedVideoCount: videos.filter(
        (entry) => entry.playBlocked,
      ).length,
      performanceVideosEnabled: this.performanceVideosEnabled,
    };
  }

  setVolume(value) {
    this.volume = clampVolume(value);
    try {
      this.storage?.setItem(
        ARCADE_BG_VOLUME_STORAGE_KEY,
        String(this.volume),
      );
    } catch {
      // Persistence is optional.
    }
    this.applyAudioPreferences();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    try {
      this.storage?.setItem(
        ARCADE_BG_MUTED_STORAGE_KEY,
        this.muted ? "1" : "0",
      );
    } catch {
      // Persistence is optional.
    }
    this.applyAudioPreferences();
  }

  setTvVolume(value) {
    this.tvVolume = clampVolume(value);
    try {
      this.storage?.setItem(TV_VOLUME_STORAGE_KEY, String(this.tvVolume));
    } catch {
      // Persistence is optional.
    }
    this.applyAudioPreferences();
  }

  setTvMuted(muted) {
    this.tvMuted = Boolean(muted);
    try {
      this.storage?.setItem(TV_MUTED_STORAGE_KEY, this.tvMuted ? "1" : "0");
    } catch {
      // Persistence is optional.
    }
    this.applyAudioPreferences();
  }

  setMasterMuted(muted) {
    this.masterMuted = Boolean(muted);
    this.applyAudioPreferences();
  }

  setOverallVolume(value) {
    this.overallVolume = clampVolume(value);
    this.applyAudioPreferences();
  }

  resetAudio() {
    this.setVolume(DEFAULT_VOLUME);
    this.setMuted(false);
    this.setTvVolume(DEFAULT_TV_VOLUME);
    this.setTvMuted(false);
  }

  setPerformanceVideosEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    if (this.performanceVideosEnabled === nextEnabled) return;
    this.performanceVideosEnabled = nextEnabled;
    for (const entry of this.entries.values()) {
      entry.shouldPlay = Boolean(
        nextEnabled && entry.video && entry.requestedPlay,
      );
      if (entry.shouldPlay) {
        this.synchronizeMediaTime(entry);
        this.requestPlayback(entry);
      } else if (entry.video && !entry.video.paused) {
        entry.video.pause();
      }
    }
  }

  applyAudioPreferences() {
    for (const entry of this.entries.values()) {
      if (!entry.video) continue;
      const definition = this.definitions[entry.gameId];
      applyMediaElementAudio(entry.video, {
        muted: this.mutedFor(definition),
        volume: this.volumeFor(definition, entry.distanceGain),
      });
    }
  }

  mutedFor(definition) {
    const channelMuted = definition?.audioChannel === "tv"
      ? this.tvMuted
      : this.muted;
    return channelMuted || this.masterMuted;
  }

  volumeFor(definition, distanceGain = 1) {
    const isTv = definition?.audioChannel === "tv";
    const channelMuted = isTv ? this.tvMuted : this.muted;
    const channelVolume = isTv ? this.tvVolume : this.volume;
    return channelMuted || this.masterMuted
      ? 0
      : channelVolume * this.overallVolume * (distanceGain ?? 1);
  }

  requestPlayback(entry) {
    if (
      !entry?.video
      || entry.disposed
      || !entry.video.paused
      || entry.playPending
    ) return;
    entry.playPending = true;
    entry.video.play().then(() => {
      entry.playPending = false;
      if (entry.disposed) return;
      entry.playBlocked = false;
    }).catch(() => {
      entry.playPending = false;
      if (entry.disposed) return;
      entry.playBlocked = true;
      this.listenForUnlock();
    });
  }

  synchronizeMediaTime(entry) {
    const { video } = entry || {};
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    const nowMs = Date.now();
    if (
      entry.mediaTimeSynchronized
      && nowMs - entry.lastMediaSyncMs < this.syncIntervalMs
    ) return;
    entry.lastMediaSyncMs = nowMs;
    const targetSeconds = loopedMediaTimeSeconds(
      this.getServerWallTimeMs(),
      this.syncEpochMs,
      video.duration,
    );
    const driftSeconds = shortestLoopTimeDifferenceSeconds(
      targetSeconds,
      video.currentTime,
      video.duration,
    );
    if (
      !entry.mediaTimeSynchronized
      || Math.abs(driftSeconds) > this.maxDriftSeconds
    ) {
      video.currentTime = targetSeconds;
    }
    entry.mediaTimeSynchronized = true;
  }

  unlockPlayback() {
    this.unlockListening = false;
    window.removeEventListener("pointerdown", this.unlockPlayback, true);
    window.removeEventListener("keydown", this.unlockPlayback, true);
    for (const entry of this.entries.values()) {
      if (entry.shouldPlay) this.requestPlayback(entry);
    }
  }

  listenForUnlock() {
    if (this.unlockListening) return;
    this.unlockListening = true;
    window.addEventListener("pointerdown", this.unlockPlayback, {
      once: true,
      capture: true,
    });
    window.addEventListener("keydown", this.unlockPlayback, {
      once: true,
      capture: true,
    });
  }

  create(gameId) {
    const existing = this.entries.get(gameId);
    if (existing) return existing;
    const definition = this.definitions[gameId];
    if (!definition?.attractUrl && !definition?.attractImageUrl) return null;

    let video = null;
    let hls = null;
    let texture = null;
    let mediaLifecycle = null;
    if (definition.attractUrl) {
      mediaLifecycle = { disposed: false };
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.preload = "auto";
      video.playsInline = true;
      applyMediaElementAudio(video, {
        muted: this.mutedFor(definition),
        volume: this.volumeFor(definition),
      });
      video.setAttribute("playsinline", "");
      hls = attachVideoSource(video, definition);
      texture = new BABYLON.VideoTexture(
        `${gameId}_attract_texture`,
        video,
        this.scene,
        false,
        false,
        BABYLON.Texture.BILINEAR_SAMPLINGMODE,
        {
          autoPlay: false,
          loop: true,
          muted: video.muted,
        },
        (message) => {
          // Babylon may still be settling its initial play promise when a
          // world transition disposes the screen. Releasing that media is
          // intentional; errors while the screen is live are not.
          if (!mediaLifecycle.disposed) BABYLON.Logger.Error(message);
        },
      );
    } else {
      texture = new BABYLON.Texture(
        definition.attractImageUrl,
        this.scene,
        false,
        false,
        BABYLON.Texture.NEAREST_SAMPLINGMODE,
      );
    }
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    const material = new BABYLON.PBRMaterial(
      `${gameId}_attract_material`,
      this.scene,
    );
    material.unlit = true;
    material.albedoTexture = texture;
    material.roughness = 1;
    material.metallic = 0;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    material.zOffset = -2;
    material.zOffsetUnits = -2;

    const mesh = new BABYLON.Mesh(
      `${gameId}_attract_crt_screen`,
      this.scene,
    );
    applyScreenGeometry(mesh, definition);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.setEnabled(false);

    const entry = {
      gameId,
      mesh,
      material,
      texture,
      video,
      hls,
      mediaLifecycle,
      playPending: false,
      playBlocked: false,
      requestedPlay: false,
      shouldPlay: false,
      disposed: false,
      lastMediaSyncMs: 0,
      mediaTimeSynchronized: false,
      onLoadedMetadata: null,
      onDurationChange: null,
    };
    if (video) {
      entry.onLoadedMetadata = () => this.synchronizeMediaTime(entry);
      entry.onDurationChange = () => {
        entry.mediaTimeSynchronized = false;
        this.synchronizeMediaTime(entry);
      };
      video.addEventListener("loadedmetadata", entry.onLoadedMetadata);
      video.addEventListener("durationchange", entry.onDurationChange);
      // Setting a local MP4 src begins fetching before VideoTexture installs
      // its canplay/loadeddata listeners. Restart the load after all listeners
      // exist so fast or cached cabinet clips cannot miss initialization.
      if (!hls && !/\.m3u8(?:$|[?#])/i.test(definition.attractUrl)) {
        video.load();
      }
    }
    this.entries.set(gameId, entry);
    return entry;
  }

  update({
    activeWorldId,
    actorPosition,
    focusedGameId = null,
    liveGameId = null,
    pickerActive = false,
  }) {
    for (const [gameId, definition] of Object.entries(this.definitions)) {
      const definitionWorldId = definition.worldId || this.defaultWorldId;
      const inDefinitionWorld = activeWorldId === definitionWorldId;
      if (!inDefinitionWorld) {
        const inactiveEntry = this.entries.get(gameId);
        if (inactiveEntry) {
          inactiveEntry.mesh.setEnabled(false);
          inactiveEntry.requestedPlay = false;
          inactiveEntry.shouldPlay = false;
          inactiveEntry.video?.pause();
        }
        continue;
      }
      const entry = this.create(gameId);
      if (!entry) continue;
      const distance = Math.hypot(
        actorPosition.x - definition.center[0],
        actorPosition.z - definition.center[2],
      );
      const distanceFraction = Math.min(1, Math.max(
        0,
        (distance - FULL_VOLUME_DISTANCE)
          / (MIN_VOLUME_DISTANCE - FULL_VOLUME_DISTANCE),
      ));
      const smoothDistanceFraction = (
        distanceFraction
        * distanceFraction
        * (3 - 2 * distanceFraction)
      );
      if (entry.video) {
        entry.distanceGain = (
          1 - (1 - MIN_VOLUME_FRACTION) * smoothDistanceFraction
        );
        applyMediaElementAudio(entry.video, {
          muted: this.mutedFor(definition),
          volume: this.volumeFor(definition, entry.distanceGain),
        });
      }
      entry.mesh.setEnabled(!pickerActive && liveGameId !== gameId);
      entry.requestedPlay = Boolean(entry.video) && focusedGameId !== gameId;
      entry.shouldPlay = (
        this.performanceVideosEnabled && entry.requestedPlay
      );
      if (entry.shouldPlay) {
        this.synchronizeMediaTime(entry);
        this.requestPlayback(entry);
      } else if (entry.video && !entry.video.paused) {
        entry.video.pause();
      }
    }
  }

  dispose() {
    window.removeEventListener("pointerdown", this.unlockPlayback, true);
    window.removeEventListener("keydown", this.unlockPlayback, true);
    this.unlockListening = false;
    for (const entry of this.entries.values()) {
      entry.disposed = true;
      if (entry.mediaLifecycle) entry.mediaLifecycle.disposed = true;
      entry.shouldPlay = false;
      if (entry.video) {
        entry.video.pause();
        entry.video.removeEventListener(
          "loadedmetadata",
          entry.onLoadedMetadata,
        );
        entry.video.removeEventListener(
          "durationchange",
          entry.onDurationChange,
        );
      }
      entry.mesh.dispose(false, false);
      entry.material.dispose(false, false);
      // Dispose Babylon's media listeners before HLS detaches or load()
      // intentionally aborts the resource fetch.
      entry.texture.dispose();
      entry.hls?.destroy();
      if (entry.video) {
        entry.video.srcObject = null;
        entry.video.removeAttribute("src");
        entry.video.load();
      }
    }
    this.entries.clear();
  }
}
