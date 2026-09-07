export class ArcadeAudioControls {
  constructor({ dom, runtime }) {
    this.dom = dom;
    this.runtime = runtime;
    this.onVolumeInput = () => {
      this.runtime.setVolume(this.dom.arcadeBgVolume.value);
    };
    this.onMutedChange = () => {
      this.runtime.setMuted(this.dom.arcadeBgMuted.checked);
    };
    this.onTvVolumeInput = () => {
      this.runtime.setTvVolume(this.dom.tvVolume.value);
    };
    this.onTvMutedChange = () => {
      this.runtime.setTvMuted(this.dom.tvMuted.checked);
    };
    this.render();
    this.dom.arcadeBgVolume.addEventListener("input", this.onVolumeInput);
    this.dom.arcadeBgMuted.addEventListener("change", this.onMutedChange);
    this.dom.tvVolume.addEventListener("input", this.onTvVolumeInput);
    this.dom.tvMuted.addEventListener("change", this.onTvMutedChange);
  }

  render() {
    const state = this.runtime.getAudioState();
    this.dom.arcadeBgVolume.value = String(state.volume);
    this.dom.arcadeBgMuted.checked = state.muted;
    this.dom.tvVolume.value = String(state.tvVolume);
    this.dom.tvMuted.checked = state.tvMuted;
  }

  reset() {
    this.runtime.resetAudio();
    this.render();
  }

  setWorld() {}

  dispose() {
    this.dom.arcadeBgVolume.removeEventListener(
      "input",
      this.onVolumeInput,
    );
    this.dom.arcadeBgMuted.removeEventListener(
      "change",
      this.onMutedChange,
    );
    this.dom.tvVolume.removeEventListener("input", this.onTvVolumeInput);
    this.dom.tvMuted.removeEventListener("change", this.onTvMutedChange);
  }
}
