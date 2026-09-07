import { audioPreferences } from "../audio/AudioPreferences.js";
import { MusicControls } from "./MusicControls.js";

let sharedMusicControls = null;
let initialization = null;

export function getSharedMusicControls(dom) {
  if (sharedMusicControls) return sharedMusicControls;
  const audioState = audioPreferences.getState();
  sharedMusicControls = new MusicControls({
    dom,
    masterMuted: audioState.masterMuted,
    overallVolume: audioState.overallVolume,
  });
  sharedMusicControls.setWorld("account-menu");
  initialization = sharedMusicControls.initialize();
  return sharedMusicControls;
}

export async function initializeSharedMusicControls(dom) {
  const controls = getSharedMusicControls(dom);
  await initialization;
  return controls;
}
