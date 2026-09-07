import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  dispatchNativeRoomSoundCommand,
  resolveNativeRoomSoundCommand,
} from "../play/events/NativeRoomSoundCommands.js";

const op02Manifest = JSON.parse(readFileSync(
  "play/assets/introduction/op02/manifest.json",
  "utf8",
));

test("resolves the exact D000 controller word in Dreamcast byte order", () => {
  assert.deepEqual(resolveNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x006805a9, 0, 0],
  }), {
    commandHex: "a9056800",
    kind: "effect",
    exactArguments: [0, 0],
    bank: "f1dobuit",
  });
});

test("resolves selector 18 music only with its exact installed sound bank", () => {
  const soundBankSlots = Array(8).fill(null);
  soundBankSlots[2] = "bgm013.snd";
  assert.deepEqual(resolveNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000025a8, 0, 0],
    soundBankSlots,
  }), {
    commandHex: "a8250000",
    kind: "music",
    exactArguments: [0, 0],
    requiredSlot: 2,
    requiredBank: "bgm013.snd",
    trackId: "dobuita-selector-18",
  });
  soundBankSlots[2] = "bgm012.snd";
  assert.equal(resolveNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000025a8, 0, 0],
    soundBankSlots,
  }), null);
});

test("dispatches only an exact room, command, and argument contract", () => {
  const calls = [];
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x006805a9, 0, 0],
    playCommand: (...args) => calls.push(args),
  }), 0);
  assert.deepEqual(calls, [[
    "a9056800",
    { bank: "f1dobuit" },
  ]]);

  for (const input of [
    { area: "JOMO", arguments: [0x006805a9, 0, 0] },
    { area: "D000", arguments: [0x006805a9, 1, 0] },
    { area: "D000", arguments: [0x006705a9, 0, 0] },
  ]) {
    assert.equal(dispatchNativeRoomSoundCommand({
      ...input,
      playCommand: () => calls.push("unexpected"),
    }), undefined);
  }
  assert.equal(calls.length, 1);
});

test("dispatches the exact selector 18 sequence through the music owner", () => {
  const calls = [];
  const soundBankSlots = Array(8).fill(null);
  soundBankSlots[2] = "BGM013.SND";
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000025a8, 0, 0],
    soundBankSlots,
    playMusicTrack: trackId => (calls.push(trackId), true),
  }), 0);
  assert.deepEqual(calls, ["dobuita-selector-18"]);
});

test("dispatches generated native-program music and no-output controls", () => {
  const routes = op02Manifest.ownerAudioCommands;
  const music = [];
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "OP02",
    arguments: [0x00002ba8, 0, 0],
    routes,
    playMusicTrack: trackId => (music.push(trackId), true),
  }), 0);
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "OP02",
    arguments: [0x000004a0, 2, 100],
    routes,
  }), 0);
  assert.deepEqual(music, ["bgm019"]);
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "OP02",
    arguments: [0x000004a0, 2, 99],
    routes,
  }), undefined);
});

test("accepts only the exact A004 tuple ignored by the original driver", () => {
  assert.deepEqual(resolveNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000004a0, 2, 115],
  }), {
    commandHex: "a0040000",
    kind: "aica-driver-ignored",
    exactArguments: [2, 115],
    constructedQueueWord: 2,
  });
  assert.equal(dispatchNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000004a0, 2, 115],
  }), 0);
  assert.equal(resolveNativeRoomSoundCommand({
    area: "D000",
    arguments: [0x000004a0, 2, 114],
  }), null);
});

test("the shipped command matches the extracted controller and DTPK record", () => {
  const evidence = JSON.parse(readFileSync(new URL(
    "../tools/evidence/d000-phone-controller-sound-evidence.json",
    import.meta.url,
  )));
  const manifest = JSON.parse(readFileSync(new URL(
    "../public/audio/world/f1dobuit/phone-controller-manifest.json",
    import.meta.url,
  )));
  assert.equal(evidence.status, "verified");
  assert.equal(evidence.scriptCall.callFileOffset, "0x6beee");
  assert.deepEqual(evidence.scriptCall.arguments, [0x006805a9, 0, 0]);
  assert.equal(manifest.source.sha256, evidence.source.bank.sha256);
  assert.deepEqual(manifest.tracks.map(track => track.commandHex), [
    evidence.scriptCall.commandHex,
  ]);
  assert.ok(existsSync(new URL(
    `../public/audio/world/f1dobuit/${
      evidence.scriptCall.commandHex
    }.webm`,
    import.meta.url,
  )));
});
