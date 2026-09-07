import { R2_URL, OFFLINE_MODE } from "../../src/constants.js";
import { resolveRuntimeAssetUrl } from "../../src/RuntimeAssets.js";

const AUDIO_MANIFEST_URLS = Object.freeze({
  shenmue: "/music/asset-viewer-manifest.json",
  shenmue2: "/music/shenmue2-asset-viewer-manifest.json",
});

export const AUDIO_MODE_EVENT = "newyokosuka:asset-viewer-audio-mode";
export const AUDIO_TRACK_EVENT = "newyokosuka:asset-viewer-audio-track";
export const AUDIO_EXIT_EVENT = "newyokosuka:asset-viewer-audio-exit";
export const AUDIO_GAME_EVENT = "newyokosuka:asset-viewer-audio-game";

let audioModeActive = false;
const manifestPromises = new Map();
let audioGame = "shenmue";

export function getAudioGame() { return audioGame; }

export function selectAudioGame(game, { updateUrl = true } = {}) {
  if (!Object.hasOwn(AUDIO_MANIFEST_URLS, game)) throw new Error(`Unknown audio game: ${game}`);
  if (audioGame === game) return;
  audioGame = game;
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "audio");
    url.searchParams.set("game", game);
    history.pushState(null, "", url);
  }
  window.dispatchEvent(new CustomEvent(AUDIO_EXIT_EVENT));
  window.dispatchEvent(new CustomEvent(AUDIO_GAME_EVENT, { detail: { game } }));
}

export function syncAudioGameFromUrl() {
  selectAudioGame(new URLSearchParams(window.location.search).get("game") === "shenmue2"
    ? "shenmue2" : "shenmue", { updateUrl: false });
}

export function resolveArchiveAudioUrl(url) {
  // Older S1 manifests have absolute R2 URLs. Respect the shared dev proxy
  // and offline mode for those too, including downloads (which require CORS).
  const oldBase = "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev/";
  if (url?.startsWith(oldBase)) {
    const key = url.slice(oldBase.length);
    return OFFLINE_MODE ? `/${key.replace(/^shenmue\//, "")}` : `${R2_URL}/${key}`;
  }
  return resolveRuntimeAssetUrl(url);
}

export function isAudioModeActive() {
  return audioModeActive;
}

export function loadAudioManifest(game = audioGame) {
  if (!Object.hasOwn(AUDIO_MANIFEST_URLS, game)) return Promise.reject(new Error(`Unknown audio game: ${game}`));
  if (!manifestPromises.has(game)) {
    const promise = fetch(AUDIO_MANIFEST_URLS[game], { signal: AbortSignal.timeout(15000) }).then((response) => {
      if (!response.ok) {
        throw new Error(`Music manifest returned ${response.status}`);
      }
      return response.json();
    }).then((manifest) => {
      if (!manifest?.tracks || typeof manifest.tracks !== "object" || Array.isArray(manifest.tracks)) {
        throw new Error("Music manifest has no tracks");
      }
      return manifest;
    }).catch((error) => {
      manifestPromises.delete(game);
      throw error;
    });
    manifestPromises.set(game, promise);
  }
  return manifestPromises.get(game);
}

export function enterAudioViewer() {
  syncAudioGameFromUrl();
  audioModeActive = true;
  document.getElementById("model-list")?.classList.add("hidden");
  document.getElementById("audio-catalog-root")?.classList.remove("hidden");
  document.getElementById("audio-player-root")?.classList.remove("hidden");
  document.getElementById("scene-mode-controls")?.classList.add("hidden");
  window.dispatchEvent(new CustomEvent(AUDIO_MODE_EVENT, {
    detail: { active: true },
  }));
}

export function exitAudioViewer() {
  if (!audioModeActive) return;
  audioModeActive = false;
  document.getElementById("model-list")?.classList.remove("hidden");
  document.getElementById("audio-catalog-root")?.classList.add("hidden");
  document.getElementById("audio-player-root")?.classList.add("hidden");
  document.getElementById("scene-mode-controls")?.classList.remove("hidden");
  window.dispatchEvent(new CustomEvent(AUDIO_MODE_EVENT, {
    detail: { active: false },
  }));
  window.dispatchEvent(new CustomEvent(AUDIO_EXIT_EVENT));
}

export function selectAudioTrack(track) {
  window.dispatchEvent(new CustomEvent(AUDIO_TRACK_EVENT, { detail: track }));
}
