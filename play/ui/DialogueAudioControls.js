export class DialogueAudioControls {
  constructor({ dom, runtime }) {
    this.dom = dom;
    this.runtime = runtime;
    this.onVolumeInput = () => {
      this.runtime.setVolume(this.dom.dialogueVolume.value);
    };
    this.onMutedChange = () => {
      this.runtime.setMuted(this.dom.dialogueMuted.checked);
    };
    this.render();
    this.dom.dialogueVolume.addEventListener("input", this.onVolumeInput);
    this.dom.dialogueMuted.addEventListener("change", this.onMutedChange);
  }

  render() {
    const state = this.runtime.getState();
    this.dom.dialogueVolume.value = String(state.volume);
    this.dom.dialogueMuted.checked = state.muted;
  }

  reset() {
    this.runtime.reset();
    this.render();
  }

  dispose() {
    this.dom.dialogueVolume.removeEventListener(
      "input",
      this.onVolumeInput,
    );
    this.dom.dialogueMuted.removeEventListener(
      "change",
      this.onMutedChange,
    );
  }
}
