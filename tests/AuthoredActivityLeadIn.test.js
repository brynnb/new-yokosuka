import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createNativeAseqActivityRuntime } from "../play/events/NativeAseqActivityRuntime.js";
import { notebookPagesForCharacter } from "../play/config/notebook.js";
import { prependAuthoredActivityLeadIn } from "../play/events/AuthoredActivityLeadIn.js";

const read = file => JSON.parse(fs.readFileSync(file));
const manifest = read("play/assets/hazuki/mska/manifest.json");
const audio = read("public/audio/world/mska/manifest.json");
const lead = read("public/audio/world/first-dojo/manifest.json");

test("authored dojo lead-in preserves original ending, voices and runtime duration", async () => {
  let began;
  const runtime = createNativeAseqActivityRuntime({
    manifest: { ...manifest, activities: manifest.activities.map(activity => ({ ...activity, authoredLeadIn: lead.authoredLeadIn })) },
    audioManifest: { ...audio, voices: [...lead.voices, ...audio.voices] },
    loadAsset: file => fs.readFileSync(file),
    presentation: { beginActivity: detail => { began = detail; return {}; }, advanceActivity: () => true, endActivity: () => true },
  });
  const binding = { primaryPointer: 0x5ee04, secondaryPointer: 0x5ee09 };
  const started = await runtime.startActivity({ slot: 0, binding });
  const duration = 1 + lead.authoredLeadIn.lines.reduce((n, line) => n + line.durationFrames, 0);
  assert.equal(started.durationFrames, manifest.activities[0].durationFrames + duration);
  assert.equal(began.prepared.frames.flatMap(f => f.commands).filter(c => c.name === "voice").length, 16);
  const first = began.prepared.frames.find(f => f.frame === 1);
  assert.equal(first.commands.find(c => c.name === "voice").audio.voiceId, "SA1116B001");
  assert.ok(first.commands.filter(c => c.name === "motion").every(c => c.hold));
  assert.equal(first.commands.find(c => c.name === "camera").camera.channels.positionX.values[0], lead.authoredLeadIn.camera.positionX);
  const ending = began.prepared.frames.find(f => f.frame === duration + 1);
  assert.ok(ending.commands.filter(c => c.name === "motion").every(c => !c.hold));
  assert.equal(ending.commands.find(c => c.name === "camera").camera.channels.positionX.times[0], duration / 30);
  assert.notEqual(ending.commands.find(c => c.name === "camera").camera.channels.positionX.values[0], lead.authoredLeadIn.camera.positionX);
  for (let frame = 1; frame <= started.durationFrames; frame++) assert.equal(runtime.updateActivity({ ...started, previousFrame: frame - 1, currentFrame: frame }), true);
  assert.equal(runtime.stopActivity({ activity: started, reason: "complete" }), true);
});

test("authored camera rejects incomplete or non-finite framing rather than silently falling back", () => {
  const prepared = { sequence: { actors: ["AKIR", "FUKU"] }, frames: [{ frame: 1, commands: ["camera", "move", "motion"].map(name => ({ name })) }] };
  for (const camera of [{ positionX: 1 }, { ...lead.authoredLeadIn.camera, perspective: 0 },
    { ...lead.authoredLeadIn.camera, positionY: NaN }]) {
    assert.throws(() => prependAuthoredActivityLeadIn(prepared,
      { ...lead.authoredLeadIn, camera }, {}), /Invalid authored lead-in camera/);
  }
});

test("investigation notebook is ordered, personal, and derived from committed flags", () => {
  const character = { id: 1, playMode: "story", openingCompleted: true, storyFlags: {} };
  assert.equal(notebookPagesForCharacter(character).length, 5);
  character.storyFlags["notebook.s1.allowance"] = true;
  assert.equal(notebookPagesForCharacter(character).length, 6);
  character.storyFlags["notebook.s1.men-in-black"] = true;
  assert.equal(notebookPagesForCharacter(character)[6].id, "story-men-in-black");
  character.storyFlags["notebook.s1.black-car"] = true;
  assert.equal(notebookPagesForCharacter(character).length, 8);
  assert.ok(!notebookPagesForCharacter(character).some(page => page.id === "story-yamagishi-witness"));
  character.storyFlags["notebook.s1.yamagishi-witness"] = true;
  assert.equal(notebookPagesForCharacter(character)[8].id, "story-yamagishi-witness");
  for (const clue of ["dobuita-black-car", "tom-witness", "chinese-community"]) {
    character.storyFlags[`notebook.s1.${clue}`] = true;
  }
  assert.deepEqual(notebookPagesForCharacter(character).slice(9).map(page => page.id),
    ["story-dobuita-black-car", "story-tom-witness", "story-chinese-community"]);
  assert.equal(notebookPagesForCharacter({ ...character, storyFlags: {} }).length, 5);
  assert.equal(notebookPagesForCharacter({ ...character, playMode: "free_roam" }).length, 0);
});
