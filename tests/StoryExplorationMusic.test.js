import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { StoryExplorationMusic, storyMusicSelection, nativeSelectMusicBank, STORY_MUSIC_STAGES } from "../play/audio/StoryExplorationMusic.js";
import { PlayMusicDirector } from "../play/audio/MusicDirector.js";

const manifest = JSON.parse(readFileSync("public/music/manifest.json", "utf8"));
const completed = (...names) => Object.fromEntries(names.map(name => [`story.s1.${name}.completed`, true]));
const story = storyFlags => ({ id: 1, modeRevision: 2, playMode: "story", storyFlags });
const date = time => new Date(`1986-12-03T${time}Z`);

function harness(character = story({})) {
  const audio = [];
  const director = new PlayMusicDirector({ persistPreferences: false, crossfadeMs: 0,
    audioFactory: () => {
      const element = { play: async () => {}, pause() {}, removeAttribute() {} };
      audio.push(element); return element;
    },
  });
  let allowed = true;
  const music = new StoryExplorationMusic({
    getCharacter: () => character, includedWorldIds: ["dobuita", "yamanose", "mfsy", "mksg"],
    canPlayCue: () => allowed,
    musicControls: {
      setWorld: (...args) => director.setWorld(...args),
      isTemporaryTrackPlaying: () => director.getState().temporary,
      playTemporaryTrack: (...args) => director.playTemporaryTrack(...args),
    },
  });
  director.setManifest(manifest); director.unlock();
  return { director, music, audio, character, block: () => { allowed = false; }, allow: () => { allowed = true; } };
}

test("native SELECT clamps by disc before dividing STEP; same filename is not the same bank", () => {
  assert.equal(nativeSelectMusicBank(1, 109), "FRE1000.SND");
  assert.equal(nativeSelectMusicBank(1, 110), "FRE0000.SND");
  assert.equal(nativeSelectMusicBank(2, 109), "FRE1100.SND");
  assert.equal(nativeSelectMusicBank(2, 200), "FRE1100.SND");
  assert.equal(nativeSelectMusicBank(3, 199), "FRE2000.SND");
  assert.equal(nativeSelectMusicBank(3, 249), "FRE2400.SND");
  assert.throws(() => nativeSelectMusicBank(4, 10));
  const stealth = manifest.tracks[manifest.selections["2:YKM005.SND"]];
  assert.equal(stealth.source.bankSha256, "57e2c04a2c106cc77dba9efa7ff6e2651e3c6c3f81a5d1915352ead06a67dd78");
  assert.equal(stealth.source.groupCommand, "A83F0000");
});

test("all generated Story selections reference exact published, locally restored bytes", () => {
  const assets = JSON.parse(readFileSync("src/runtime-assets.generated.json", "utf8")).assets;
  for (const id of new Set(Object.values(manifest.selections))) {
    const track = manifest.tracks[id];
    const path = `public${track.url}`;
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), track.sha256, id);
    assert.equal(assets[path].sha256, track.sha256, id);
  }
});

test("saved milestones resolve on login, late optional flags do not regress, dates are not progress", () => {
  const corpus = readFileSync("tools/scripting/story-investigation.json", "utf8");
  for (const stage of STORY_MUSIC_STAGES) {
    assert.ok(corpus.includes(stage.flag), `missing saved milestone ${stage.flag}`);
    const selection = storyMusicSelection(story({ [stage.flag]: true }), "dobuita");
    assert.ok(manifest.tracks[manifest.selections[selection]], selection);
  }
  assert.equal(storyMusicSelection(story({}), "dobuita"), "1:FRE0100.SND");
  assert.equal(storyMusicSelection(story(completed("tao-three-blades", "phoenix-mirror")), "dobuita"), "2:FRE1600.SND");
  assert.equal(storyMusicSelection(story(completed("jimmy-interrogation")), "yamanose"), "3:FRE2000.SND");
  assert.equal(storyMusicSelection(story({}), "mksg"), "2:YKM005.SND");
  assert.equal(storyMusicSelection(story(completed("master-chen")), "mksg"), "2:FRE1300.SND");
  for (const world of ["exterior", "interior", "arcade", "ma00", "ma00race", "s2-aberden"]) {
    assert.equal(storyMusicSelection(story({}), world), undefined);
  }
  assert.equal(storyMusicSelection({ playMode: "free_roam", storyFlags: completed("phoenix-mirror") }, "dobuita"), undefined);
});

test("actual director changes a settled Story stage once; temporary music resumes the latest stage", async () => {
  const { music, director, audio, character } = harness();
  music.setWorld("dobuita");
  assert.equal(director.getState().label, "FREE 1");
  for (let i = 0; i < 30; i++) music.update(date("12:00:00"), "dobuita");
  assert.equal(audio.length, 1);
  character.storyFlags = completed("tao-three-blades");
  music.update(date("12:01:00"), "dobuita");
  assert.equal(director.getState().label, "FREE 5");
  assert.equal(audio.length, 2);
  director.playTemporaryTrack("bgm019");
  character.storyFlags = completed("phoenix-mirror");
  music.update(date("12:02:00"), "dobuita");
  assert.equal(director.getState().trackId, "bgm019");
  director.stopTemporaryTrack("bgm019");
  assert.equal(director.getState().label, "FREE 3");
  character.playMode = "free_roam"; character.modeRevision++;
  music.update(date("12:02:01"), "dobuita");
  assert.equal(director.getState().trackId, "free-1");
  music.setWorld("mfsy");
  assert.equal(director.getState().trackId, "free-5");
  music.setWorld(null); music.update(date("12:03:00"), "dobuita");
  assert.equal(director.getState().playing, false);
});

test("Story Nightfall is 19:00, Free roam remains 21:00; no catch-up, restart, or stolen ownership", () => {
  const { music, director, character, block, allow } = harness();
  music.setWorld("dobuita");
  music.update(date("18:59:59"), "dobuita");
  music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().trackId, "old-warehouse-district");
  director.stopTemporaryTrack();
  music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().temporary, false);
  character.playMode = "free_roam"; character.modeRevision++;
  music.update(date("18:59:59"), "dobuita"); music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().temporary, false);
  music.update(date("20:59:59"), "dobuita"); music.update(date("21:00:01"), "dobuita");
  assert.equal(director.getState().trackId, "old-warehouse-district");
  director.stopTemporaryTrack();
  character.playMode = "story"; character.modeRevision++;
  music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().temporary, false, "loading after 19:00 is not a crossing");
  character.modeRevision++; block();
  music.update(date("18:59:59"), "dobuita"); music.update(date("19:00:01"), "dobuita");
  allow(); music.update(date("19:00:02"), "dobuita");
  assert.equal(director.getState().temporary, false, "suppressed crossing is consumed");
  character.modeRevision++; director.playTemporaryTrack("bgm019");
  music.update(date("18:59:59"), "dobuita"); music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().trackId, "bgm019");
});

test("selection survives async manifest load and unlock, and malformed catalogues fail explicitly", () => {
  const director = new PlayMusicDirector({ persistPreferences: false, crossfadeMs: 0, audioFactory: () => ({play: async()=>{},pause(){}}) });
  director.setWorld("dobuita", { selection: "1:FRE0100.SND" });
  assert.equal(director.getState().playing, false);
  director.setManifest(manifest);
  assert.equal(director.getState().playing, false);
  director.unlock();
  assert.equal(director.getState().label, "FREE 1");
  assert.throws(() => director.setManifest({ worlds: {}, tracks: {}, selections: { bad: "missing" } }), /missing/);
});

test("Story's accelerated 250ms observer cannot miss Nightfall, but time skips do not play it", () => {
  const { music, director, character } = harness();
  music.setWorld("dobuita");
  music.update(date("18:59:59.500"), "dobuita");
  music.update(date("19:00:03.250"), "dobuita");
  assert.equal(director.getState().trackId, "old-warehouse-district");
  director.stopTemporaryTrack(); character.modeRevision++;
  music.update(date("18:00:00"), "dobuita");
  music.update(date("19:00:01"), "dobuita");
  assert.equal(director.getState().temporary, false);
});
