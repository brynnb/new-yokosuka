import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { NEW_CHARACTER_OPENING, NEW_CHARACTER_OPENING_ARRIVAL, needsNewCharacterOpening, playNewCharacterOpening } from "../play/cutscenes/NewCharacterOpening.js";

test("opening arrival uses native JOMO entry 1 facing the bedroom doorway", () => {
  const entries = JSON.parse(fs.readFileSync("tools/evidence/map-entry-points.json", "utf8"));
  const entry = entries.maps.find(map => map.scene === 1 && map.area === "JOMO")
    .entries.find(entry => entry.entry === 1).browserProjection;
  const arrival = NEW_CHARACTER_OPENING_ARRIVAL;
  assert.equal(arrival.worldId, "interior");
  assert.deepEqual(arrival.position, entry.position);
  const placements = JSON.parse(fs.readFileSync("play/data/jomo-runtime-placements.json", "utf8"));
  const hinge = placements.placements.find(item => item.runtime?.objectTag === "dor7").position;
  const dx = hinge[0] - 0.45 - arrival.position[0];
  const dz = hinge[2] - arrival.position[2];
  assert.ok(Math.abs(arrival.yaw - Math.atan2(dx, dz)) < 1e-6);
});

test("only characters without a first world login need the opening", () => {
  assert.equal(needsNewCharacterOpening(null), false);
  assert.equal(needsNewCharacterOpening({ id: 1 }), true);
  assert.equal(needsNewCharacterOpening({ id: 1, lastLoginAt: null }), true);
  assert.equal(needsNewCharacterOpening({ id: 1, lastLoginAt: "2026-09-28" }), false);
});

test("opening waits for murder, Ine-san's mail and the original Lan Di dream", async () => {
  const played = [];
  let finish;
  const opening = playNewCharacterOpening({
    character: { id: 1 },
    playCutscene: id => { played.push(id); return new Promise(resolve => { finish = resolve; }); },
  });
  assert.deepEqual(NEW_CHARACTER_OPENING, ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"]);
  for (let i = 0; i < NEW_CHARACTER_OPENING.length; i++) {
    assert.deepEqual(played, NEW_CHARACTER_OPENING.slice(0, i + 1));
    finish(); // Natural completion and explicit user skip both settle the runner.
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(await opening, true);
});

test("returning characters do not replay the opening", async () => {
  assert.equal(await playNewCharacterOpening({
    character: { id: 1, lastLoginAt: "2026-09-28" },
    playCutscene: () => assert.fail("must not play"),
  }), false);
});

test("scene failure does not silently advance or release gameplay", async () => {
  const played = [];
  await assert.rejects(playNewCharacterOpening({
    character: { id: 1 },
    playCutscene: async id => { played.push(id); throw new Error("failed asset"); },
  }), /failed asset/);
  assert.deepEqual(played, ["S1-OP02-00"]);
});

test("disposal during playback prevents the next scene", async () => {
  const lifetime = new AbortController();
  const played = [];
  await assert.rejects(playNewCharacterOpening({
    character: { id: 1 }, signal: lifetime.signal,
    playCutscene: async id => { played.push(id); lifetime.abort(); },
  }), { name: "AbortError" });
  assert.deepEqual(played, ["S1-OP02-00"]);
});
