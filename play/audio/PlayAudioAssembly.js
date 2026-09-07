import { DailyMusicCue } from "./DailyMusicCue.js";
import { DialogueAudio } from "./DialogueAudio.js";
import { AmbientDirector } from "./AmbientDirector.js";
import { CombatSounds } from "./CombatSounds.js";
import { ForkliftSounds } from "./ForkliftSounds.js";
import { MenuSounds } from "./MenuSounds.js";
import { PoolSounds } from "./PoolSounds.js";
import { RemoteForkliftSounds } from "./RemoteForkliftSounds.js";
import { subscribeToUserActivation } from "./UserActivation.js";
import { WorldSounds } from "./WorldSounds.js";
import { DialogueAudioControls } from "../ui/DialogueAudioControls.js";
import { getSharedMusicControls } from "../ui/SharedMusicControls.js";

export class PlayAudioAssembly {
  constructor({
    dom,
    audioPreferences,
    dialogueAudioEnabled,
    ninePmWorldIds,
    getActiveForkliftId,
    sendForkliftSound,
  }) {
    this.preferenceState = audioPreferences.getState();
    this.menuSounds = new MenuSounds({ preferences: audioPreferences });
    this.combatSounds = new CombatSounds({ preferences: audioPreferences });
    this.poolSounds = new PoolSounds({ preferences: audioPreferences });
    this.worldSounds = new WorldSounds({ preferences: audioPreferences });
    this.forkliftSounds = new ForkliftSounds({
      preferences: audioPreferences,
      onNetworkCue: cue => {
        const activeId = getActiveForkliftId();
        if (activeId) sendForkliftSound(activeId, cue);
      },
    });
    this.musicControls = getSharedMusicControls(dom);
    this.ambientDirector = new AmbientDirector({
      volume: this.preferenceState.ambientVolume,
      masterMuted: this.preferenceState.masterMuted,
      overallVolume: this.preferenceState.overallVolume,
    });
    this.unsubscribeAmbientActivation = subscribeToUserActivation(() => {
      // Activation is one-shot and may be delivered synchronously when the
      // player has already interacted with the page.
      this.ambientDirector.unlock();
    });
    this.dialogueAudio = new DialogueAudio({
      masterMuted: this.preferenceState.masterMuted,
      overallVolume: this.preferenceState.overallVolume,
      enabled: dialogueAudioEnabled,
    });
    this.dialogueAudioControls = new DialogueAudioControls({
      dom,
      runtime: this.dialogueAudio,
    });
    this.ninePmMusicCue = new DailyMusicCue({
      hour: 21,
      triggerWindowSeconds: 2,
      includedWorldIds: ninePmWorldIds,
      onTrigger: () => {
        this.musicControls.playTemporaryTrack("old-warehouse-district", {
          gain: 0.68,
        });
      },
    });
    this.remoteForkliftSounds = null;
  }

  attachScene(scene, audioPreferences) {
    if (!this.remoteForkliftSounds) {
      this.remoteForkliftSounds = new RemoteForkliftSounds({
        scene,
        preferences: audioPreferences,
      });
    }
    return this.remoteForkliftSounds;
  }

  disposeActivation() {
    this.unsubscribeAmbientActivation();
  }
}
