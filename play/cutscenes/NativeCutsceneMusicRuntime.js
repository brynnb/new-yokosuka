export class NativeCutsceneMusicRuntime {
  constructor(definition, controls) {
    this.cues = definition?.cues || [];
    this.gain = definition?.gain ?? 1;
    this.controls = controls;
    this.trackId = null;
  }

  beginActivity(activity) {
    const slot = activity?.slot;
    const cue = this.cues.find(value => value.activitySlot === slot)
      || this.cues.find(value => value.startActivity === true);
    return this.#beginCue(cue);
  }

  setPaused(paused) {
    this.controls.setPlaybackPaused(Boolean(paused));
    return true;
  }

  stop() {
    if (!this.trackId) return false;
    const stopped = this.controls.stopTemporaryTrack(this.trackId);
    this.trackId = null;
    return stopped;
  }

  reset() {
    this.stop();
    this.setPaused(false);
  }

  #beginCue(cue) {
    if (!cue) return false;
    this.stop();
    const started = this.controls.playTemporaryTrack(cue.trackId, {
      gain: this.gain,
      loop: Boolean(cue.loop),
    });
    if (started) this.trackId = cue.trackId;
    return started;
  }
}

export function createNativeCutsceneMusicRuntime(definition, controls) {
  return new NativeCutsceneMusicRuntime(definition, controls);
}
