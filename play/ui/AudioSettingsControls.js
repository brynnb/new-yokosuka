export class AudioSettingsControls {
  constructor({
    dom,
    preferences,
    music,
    ambient,
    dialogue,
    arcade,
    setEmulatorAudio = () => {},
  }) {
    this.dom = dom;
    this.preferences = preferences;
    this.music = music;
    this.ambient = ambient;
    this.dialogue = dialogue;
    this.arcade = arcade;
    this.setEmulatorAudio = setEmulatorAudio;
    this.onOverallVolumeInput = () => {
      this.preferences.setOverallVolume(this.dom.overallVolume.value);
    };
    this.onEffectsVolumeInput = () => {
      this.preferences.setEffectsVolume(this.dom.soundEffectsVolume.value);
    };
    this.onAmbientVolumeInput = () => {
      this.preferences.setAmbientVolume(this.dom.ambientVolume.value);
    };
    this.onAmbientMutedChange = () => {
      this.preferences.setAmbientMuted(this.dom.ambientMuted.checked);
    };
    this.onEffectsMutedChange = () => {
      this.preferences.setEffectsMuted(this.dom.soundEffectsMuted.checked);
    };
    this.onFootstepsMutedChange = () => {
      this.preferences.setFootstepsMuted(this.dom.footstepsMuted.checked);
    };
    this.onForkliftReverseMutedChange = () => {
      this.preferences.setForkliftReverseMuted(
        this.dom.forkliftReverseMuted.checked,
      );
    };
    this.onMasterMutedChange = () => {
      this.preferences.setMasterMuted(this.dom.muteAll.checked);
    };
    this.onPreferenceChange = (state) => this.render(state);
    this.unsubscribe = this.preferences.subscribe(this.onPreferenceChange);
    this.dom.overallVolume.addEventListener(
      "input",
      this.onOverallVolumeInput,
    );
    this.dom.soundEffectsVolume.addEventListener(
      "input",
      this.onEffectsVolumeInput,
    );
    this.dom.ambientVolume.addEventListener(
      "input",
      this.onAmbientVolumeInput,
    );
    this.dom.ambientMuted.addEventListener(
      "change",
      this.onAmbientMutedChange,
    );
    this.dom.soundEffectsMuted.addEventListener(
      "change",
      this.onEffectsMutedChange,
    );
    this.dom.footstepsMuted.addEventListener(
      "change",
      this.onFootstepsMutedChange,
    );
    this.dom.forkliftReverseMuted.addEventListener(
      "change",
      this.onForkliftReverseMutedChange,
    );
    this.dom.muteAll.addEventListener("change", this.onMasterMutedChange);
    this.render(this.preferences.getState());
  }

  render(state) {
    this.dom.overallVolume.value = String(state.overallVolume);
    this.dom.soundEffectsVolume.value = String(state.effectsVolume);
    this.dom.ambientVolume.value = String(state.ambientVolume);
    this.dom.ambientMuted.checked = state.ambientMuted;
    this.dom.soundEffectsMuted.checked = state.effectsMuted;
    this.dom.footstepsMuted.checked = state.footstepsMuted;
    this.dom.forkliftReverseMuted.checked = state.forkliftReverseMuted;
    this.dom.muteAll.checked = state.masterMuted;
    this.music.setOverallVolume(state.overallVolume);
    this.ambient.setOverallVolume(state.overallVolume);
    this.ambient.setVolume(state.ambientVolume);
    this.ambient.setMuted(state.ambientMuted);
    this.dialogue.setOverallVolume(state.overallVolume);
    this.arcade.setOverallVolume(state.overallVolume);
    this.music.setMasterMuted(state.masterMuted);
    this.ambient.setMasterMuted(state.masterMuted);
    this.dialogue.setMasterMuted(state.masterMuted);
    this.arcade.setMasterMuted(state.masterMuted);
    this.setEmulatorAudio(state);
  }

  dispose() {
    this.dom.overallVolume.removeEventListener(
      "input",
      this.onOverallVolumeInput,
    );
    this.dom.soundEffectsVolume.removeEventListener(
      "input",
      this.onEffectsVolumeInput,
    );
    this.dom.ambientVolume.removeEventListener(
      "input",
      this.onAmbientVolumeInput,
    );
    this.dom.ambientMuted.removeEventListener(
      "change",
      this.onAmbientMutedChange,
    );
    this.dom.soundEffectsMuted.removeEventListener(
      "change",
      this.onEffectsMutedChange,
    );
    this.dom.footstepsMuted.removeEventListener(
      "change",
      this.onFootstepsMutedChange,
    );
    this.dom.forkliftReverseMuted.removeEventListener(
      "change",
      this.onForkliftReverseMutedChange,
    );
    this.dom.muteAll.removeEventListener("change", this.onMasterMutedChange);
    this.unsubscribe();
  }
}
