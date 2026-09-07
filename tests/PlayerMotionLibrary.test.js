import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {PlayerMotionBank, playerFeatureMotionPaths} from "../play/characters/PlayerMotionLibrary.js";
import {MotnLoader} from "../src/MotnLoader.js";

test("player motion banks decode only requested sequences and preserve source results", async () => {
  const bytes = await readFile("play/assets/dobuita/M_D000.MOTN");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const names = [];
  const bank = new PlayerMotionBank("test", {
    fetchBuffer: async () => buffer,
    parse: (source, options) => { names.push(...options.sequenceNames); return MotnLoader.parse(source, options); },
  });
  assert.throws(() => bank.getSequence("AKI_LOOK_TELBOOK_LP_F"), /not ready/);
  await bank.ensureLoaded();
  assert.deepEqual(names, []);
  const sequence = bank.getSequence("AKI_LOOK_TELBOOK_LP_F");
  assert.deepEqual(sequence, MotnLoader.parse(buffer).getSequence(sequence.name));
  assert.equal(bank.getSequence(sequence.name), sequence);
  assert.deepEqual(names, [sequence.name]);
  assert.throws(() => bank.getSequence("missing"), /missing from/);
  assert.equal(bank.sequences.has("missing"), false);
});

test("failed or cancelled player bank preparation can be retried", async () => {
  let finish;
  const bank = new PlayerMotionBank("test", {fetchBuffer: () => new Promise(resolve => { finish = resolve; })});
  const controller = new AbortController();
  const loading = bank.ensureLoaded(controller.signal);
  controller.abort(); finish(new ArrayBuffer(1));
  await assert.rejects(loading, {name: "AbortError"});
  assert.equal(bank.buffer, null);
  const retry = bank.ensureLoaded(); finish(new ArrayBuffer(2)); await retry;
  assert.equal(bank.buffer.byteLength, 2);
});

test("ordinary exploration does not request fight or forklift banks", () => {
  assert.deepEqual(playerFeatureMotionPaths({id: "dobuita"}), []);
  assert.deepEqual(playerFeatureMotionPaths({id: "mfbt"}), ["/motion/M_FGT1.BIN"]);
  assert.match(playerFeatureMotionPaths({id: "ma00", vehicle: "forklift"})[0], /M_FREE.BIN$/);
});
