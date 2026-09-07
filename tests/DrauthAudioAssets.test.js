import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseAuthSequence } from "../src/AuthSequence.js";
import { parseAuthStrings } from "../src/AuthStrings.js";
import { validateNativeLipSync } from "../src/NativeLipSync.js";

const manifest = JSON.parse(
  fs.readFileSync("public/audio/world/drauth/manifest.json", "utf8"),
);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const commandHex = word => [0, 8, 16, 24]
  .map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
  .join("");

test("DRAUTH audio pack retains exact native provenance and valid WAV outputs", () => {
  assert.equal(manifest.schema, "new-yokosuka-aseq-audio-pack-v2");
  assert.equal(manifest.voices.length, 12);
  assert.equal(manifest.sounds.length, 17);
  for (const record of [...manifest.voices, ...manifest.sounds]) {
    const bytes = fs.readFileSync(record.asset);
    assert.equal(bytes.length, record.byteLength);
    assert.equal(sha256(bytes), record.sha256);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  }
  assert.deepEqual(
    [...new Set(manifest.voices.map(record => record.speakerId))].sort(),
    ["AKIR", "SMTH", "TONY"],
  );
  for (const record of manifest.voices) {
    assert.ok(record.displayText);
    assert.ok(validateNativeLipSync(record.lipSync).cues.length > 0);
  }
});

test("every authored DRAUTH voice and sound command has one exact audio asset", () => {
  const voiceById = new Map(manifest.voices.map(record => [record.voiceId, record]));
  const soundByCommand = new Map(
    manifest.sounds.map(record => [record.commandHex, record]),
  );
  const usedVoices = new Set();
  const usedSounds = new Set();
  for (const filename of ["SEQDATA1.AUTH", "SEQDATA2.AUTH"]) {
    const auth = fs.readFileSync(path.join(
      "play/assets/dobuita/drauth",
      filename,
    ));
    const sequence = parseAuthSequence(auth);
    const strings = parseAuthStrings(auth).strings;
    for (const frame of sequence.frames) {
      for (const command of frame.commands) {
        if (command.name === "voice") {
          const sourcePath = strings[command.stringIndex];
          const voiceId = path.basename(sourcePath, path.extname(sourcePath));
          const record = voiceById.get(voiceId);
          assert.equal(record?.sourcePath, sourcePath);
          usedVoices.add(voiceId);
        }
        if (command.name === "sound") {
          const sourcePath = strings[command.stringIndex];
          const hex = commandHex(command.commandWord);
          const record = soundByCommand.get(hex);
          assert.equal(record?.sourcePath, sourcePath);
          usedSounds.add(hex);
        }
      }
    }
  }
  assert.equal(usedVoices.size, manifest.voices.length);
  assert.equal(usedSounds.size, manifest.sounds.length);
});
