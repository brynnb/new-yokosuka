import { resolveRuntimeAssetUrl } from "../../src/RuntimeAssets.js";

// Keep source paths in native data; translate them only when constructing a
// real browser media element. Injected audio adapters can retain logical paths.
export function createGameAudio(source) {
  return new Audio(resolveRuntimeAssetUrl(source));
}

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

// WebKit does not reliably honor programmatic HTMLMediaElement volume.
// Keep the native muted flag as the hard silence boundary, while volume
// remains the ordinary gain control for browsers that support it.
export function applyMediaElementAudio(audio, {
  muted = false,
  volume = 1,
} = {}) {
  if (!audio) return audio;
  const hardMuted = Boolean(muted);
  audio.muted = hardMuted;
  audio.volume = hardMuted ? 0 : clampVolume(volume);
  return audio;
}

export function setMediaElementMuted(audio, muted) {
  if (audio) audio.muted = Boolean(muted);
  return audio;
}
