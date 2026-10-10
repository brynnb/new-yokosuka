import { useSyncExternalStore } from "react";
import { Button } from "@radix-ui/themes";
import { getBrowserAudioPlayback } from "../../audio/BrowserAudioPlayback.js";

export function AudioRecoveryButton() {
  const playback = getBrowserAudioPlayback();
  const blocked = useSyncExternalStore(playback.subscribe, playback.needsGesture, () => false);
  if (!blocked) return null;
  return (
    <Button className="audio-recovery-button ny-button-light" size="2"
      onClick={() => playback.unlock()}>
      Tap to enable sound
    </Button>
  );
}
