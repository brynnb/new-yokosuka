export class NativeCutsceneMusicRuntime {
  constructor(definition, controls) {
    this.cues = definition?.cues || [];
    this.packageCue = this.cues.find(value => value.startActivity === true && value.activitySlot == null);
    this.gain = definition?.gain ?? 1;
    this.controls = controls;
    this.trackId = null;
    this.activeCue = null;
  }

  beginActivity(activity) {
    const slot = activity?.slot;
    const cue = this.cues.find(value => value.activitySlot != null && value.activitySlot === slot)
      || this.packageCue;
    return this.#beginCue(cue);
  }

  beginNamedCue(name) {
    const cue = this.cues.find(value => value.nativeName === name);
    return this.#beginCue(cue);
  }

  endActivity({ programActive = false } = {}) {
    // An activity slot is a start trigger, not the soundtrack's lifetime.
    // OP00's OPEN1/OPEN2 span several AUTHs; releasing on their triggering
    // activity truncated 82/249-second tracks to 28/27 seconds. A new cue can
    // replace the track; program completion/cancellation releases ownership.
    if (programActive) return;
    this.reset();
  }

  setPaused(paused) {
    this.controls.setPlaybackPaused(Boolean(paused));
    return true;
  }

  stop() {
    if (!this.trackId) return false;
    const stopped = this.controls.stopTemporaryTrack(this.trackId);
    this.trackId = null;
    this.activeCue = null;
    return stopped;
  }

  reset() {
    this.stop();
    this.setPaused(false);
  }

  #beginCue(cue) {
    if (!cue) return false;
    if (cue === this.activeCue && cue === this.packageCue) return true;
    this.stop();
    const started = this.controls.playTemporaryTrack(cue.trackId, {
      gain: this.gain,
      loop: Boolean(cue.loop),
    });
    if (started) {
      this.trackId = cue.trackId;
      this.activeCue = cue;
    }
    return started;
  }
}

export function createNativeCutsceneMusicRuntime(definition, controls) {
  return new NativeCutsceneMusicRuntime(definition, controls);
}
