import { DailyMusicCue } from "./DailyMusicCue.js";

// Authored milestones bridge to the observed original SELECT stages. These
// numbers select banks; they do NOT claim to reconstruct or mutate native STEP.
// Evidence and the deliberate adaptation are in docs/research/story-evening.md.
export const STORY_MUSIC_STAGES = Object.freeze([
  ["tao-three-blades", 1, 20],
  ["liu-senior-sailors", 1, 30],
  ["parking-lot-ambush", 1, 50],
  ["charlie-tattoo-confrontation", 1, 60],
  ["chinese-letter", 1, 70],
  ["gao-rescue", 1, 80],
  ["xia-letter-translation", 1, 90],
  ["amihama-directory", 1, 100],
  ["harbor-arrival", 2, 110],
  ["warehouse-eight-overheard", 2, 120],
  ["master-chen", 2, 130],
  ["family-mirror-lead", 2, 140],
  ["bunkado-handguard", 2, 150],
  ["phoenix-mirror", 2, 160],
  ["post-chen-home", 2, 170],
  ["boat-ticket-collection", 2, 180],
  ["jimmy-morning-call", 2, 190],
  ["jimmy-interrogation", 3, 200],
].map(([milestone, disc, step]) => Object.freeze({
  flag: `story.s1.${milestone}.completed`, disc, step,
})));

// 1ST_READ.BIN 0xc17a65a: disc clamps, then integer STEP / 10.
export function nativeSelectMusicBank(disc, step) {
  if (![1, 2, 3].includes(disc) || !Number.isInteger(step) || step < 0) {
    throw new TypeError("SELECT requires a Shenmue I disc and nonnegative STEP");
  }
  if (disc === 1 && step >= 110) step = 0;
  if (disc === 2 && (step < 110 || step >= 200)) step = 110;
  if (disc === 3 && step < 200) step = 200;
  return `FRE${String(Math.trunc(step / 10)).padStart(2, "0")}00.SND`;
}

const SELECT_WORLDS = new Set(["yamanose", "sakuragaoka", "dobuita", "mfsy", "mfbt", "mksg"]);

export function storyMusicSelection(character, worldId) {
  if (character?.playMode !== "story" || !SELECT_WORLDS.has(worldId)) return undefined;
  const flags = character.storyFlags ?? {};
  let stage = { disc: 1, step: 10 }; // The playable opening starts with FREE 1.
  for (const candidate of STORY_MUSIC_STAGES) {
    if (flags[candidate.flag]) stage = candidate;
  }
  if (worldId === "mksg" && stage.step < 130) return "2:YKM005.SND";
  return `${stage.disc}:${nativeSelectMusicBank(stage.disc, stage.step)}`;
}

/** Owns exploration policy, not audio playback or saved progress. */
export class StoryExplorationMusic {
  constructor({ musicControls, getCharacter, includedWorldIds, canPlayCue = () => true }) {
    this.musicControls = musicControls;
    this.getCharacter = getCharacter;
    this.canPlayCue = canPlayCue;
    this.context = null;
    this.assignmentKey = null;
    this.cues = Object.fromEntries([["story", 19], ["free", 21]].map(([mode, hour]) => [
      mode, new DailyMusicCue({ hour, includedWorldIds,
        // Story advances 15 game seconds per real second. A 250ms observer
        // already steps 3.75s: allow one real second's jitter, but not time skips.
        // Preserve the previously chosen Free roam window exactly.
        triggerWindowSeconds: mode === "story" ? 15 : 2,
        maxAdvanceSeconds: mode === "story" ? 15 : Infinity,
        onTrigger: () => {
          // A crossed cue is consumed even when a fight/cinematic owns audio.
          if (this.canPlayCue() && !this.musicControls.isTemporaryTrackPlaying()) {
            this.musicControls.playTemporaryTrack("old-warehouse-district", { gain: 0.68 });
          }
        },
      }),
    ]));
  }

  setWorld(worldId, options = {}) {
    this.worldId = worldId;
    const selection = storyMusicSelection(this.getCharacter(), worldId);
    this.assignmentKey = selection;
    this.musicControls.setWorld(worldId, { ...options, selection });
  }

  isEligible(worldId) { return this.cues.free.isEligible(worldId); }

  update(date, worldId) {
    const character = this.getCharacter();
    const mode = character?.playMode === "story" ? "story" : "free";
    const context = `${character?.id}:${character?.modeRevision}:${mode}`;
    if (context !== this.context) {
      this.context = context;
      for (const cue of Object.values(this.cues)) cue.reset();
    }
    // Only the lifecycle can enter a music world. Background clock ticks during
    // a menu, unload, or cutscene-only stage must not start exploration music.
    if (this.worldId === worldId) {
      const selection = storyMusicSelection(character, worldId);
      if (selection !== this.assignmentKey) this.setWorld(worldId, { preserveTemporary: true });
    }
    return this.cues[mode].update(date, this.worldId === worldId ? worldId : null);
  }
}
