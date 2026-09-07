import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  parseFightBytecode,
  traceFightActionPath,
} from "../src/FightBytecode.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = [
  "extracted_disc3_v2/data/SCENE/03/MFBT/EN_RYOU.BIN",
].map((candidate) => path.resolve(repoRoot, candidate))
  .find(existsSync);

test("parses the native Ryo FIGHT sections and command records", {
  skip: !sourcePath && "Disc 3 extraction is unavailable",
}, () => {
  const fight = parseFightBytecode(readFileSync(sourcePath));
  assert.equal(fight.byteLength, 7596);
  assert.deepEqual(
    fight.header.sectionOffsets,
    [0x14, 0x17f8, 0x1bbc, 0x1d8a],
  );
  assert.equal(fight.entryDispatch.opcode, 0x47);
  assert.equal(fight.entryDispatch.selector, 0x50);
  assert.equal(fight.commandRecords.length, 48);
  assert.equal(fight.motionRequests.length, 154);
  assert.equal(
    fight.motionRequests.some(({ fileOffset }) => fileOffset === 0x055c),
    false,
  );
  assert.equal(fight.sections.commands.recordSize, 20);
  assert.equal(fight.sections.commands.terminatorOffset, 0x1bb8);
});

test("recovers Tiger Knuckle's exact native motion request", {
  skip: !sourcePath && "Disc 3 extraction is unavailable",
}, () => {
  const fight = parseFightBytecode(readFileSync(sourcePath));
  const handBranch = fight.entryDispatch.branches.find(
    ({ selector }) => selector === 1,
  );
  assert.deepEqual(handBranch, {
    fileOffset: 0x18,
    scriptRelativeOffset: 4,
    selector: 1,
    targetOffset: 0x98,
    targetFileOffset: 0xac,
  });
  assert.ok(fight.motionRequests.some((request) => (
    request.fileOffset === 0x03bc
    && request.rawRequest === 0x00000318
    && request.motionId === 792
    && request.sequenceIndex === 791
  )));
});

test("recovers Tiger Maelstrom's native J K K K continuation tree", {
  skip: !sourcePath && "Disc 3 extraction is unavailable",
}, () => {
  const bytes = readFileSync(sourcePath);
  const firstKick = traceFightActionPath(bytes, {
    startFileOffset: 0x03c4,
    selector: 2,
  });
  assert.equal(firstKick.terminal.motionId, 0x0366);
  assert.equal(firstKick.continuationFileOffset, 0x040c);

  const secondKick = traceFightActionPath(bytes, {
    startFileOffset: firstKick.continuationFileOffset,
    selector: 2,
  });
  assert.equal(secondKick.terminal.motionId, 0x05c0);
  assert.equal(secondKick.continuationFileOffset, 0x0434);

  const thirdKick = traceFightActionPath(bytes, {
    startFileOffset: secondKick.continuationFileOffset,
    selector: 2,
  });
  assert.equal(thirdKick.terminal.motionId, 0x05c1);
  assert.equal(thirdKick.continuationFileOffset, null);
});

test("recovers both primary and stacked fallback combo paths", {
  skip: !sourcePath && "Disc 3 extraction is unavailable",
}, () => {
  const bytes = readFileSync(sourcePath);
  const connected = traceFightActionPath(bytes, {
    startFileOffset: 0x0450,
    selector: 1,
  });
  assert.equal(connected.terminal.motionId, 0x05be);
  assert.equal(connected.continuationFileOffset, 0x048c);
  assert.deepEqual(connected.fallbackContinuationFileOffsets, [0x04c0]);
  assert.deepEqual(
    connected.instructions.find(({ opcode }) => opcode === 0x48),
    {
      fileOffset: 0x0468,
      scriptRelativeOffset: 0x0454,
      opcode: 0x48,
      requiredInputMask: 0x0020,
      historyMatchParameter: 0x3000,
      reserved: 0,
    },
  );

  const fallback = traceFightActionPath(bytes, {
    startFileOffset: connected.fallbackContinuationFileOffsets[0],
    selector: 1,
  });
  assert.equal(fallback.terminal.motionId, 0x0288);
  assert.equal(fallback.continuationFileOffset, 0x0558);

  const backwardHistoryMatch = traceFightActionPath(bytes, {
    startFileOffset: 0x04e0,
    selector: 2,
  });
  assert.deepEqual(
    backwardHistoryMatch.instructions.find(({ opcode }) => opcode === 0x48),
    {
      fileOffset: 0x04e0,
      scriptRelativeOffset: 0x04cc,
      opcode: 0x48,
      requiredInputMask: 0x0010,
      historyMatchParameter: 0x3000,
      reserved: 0,
    },
  );
  assert.equal(backwardHistoryMatch.terminal.motionId, 0x0314);
});

test("separates bit-15 request flags from the registered motion id", {
  skip: !sourcePath && "Disc 3 extraction is unavailable",
}, () => {
  const fight = parseFightBytecode(readFileSync(sourcePath));
  const flagged = fight.motionRequests.find(
    ({ fileOffset }) => fileOffset === 0x0590,
  );
  assert.equal(flagged.rawRequest, 0x00008364);
  assert.equal(flagged.encodedMotionId, 0x8364);
  assert.equal(flagged.motionIdFlags, 0x8000);
  assert.equal(flagged.motionId, 0x0364);
  assert.equal(flagged.sequenceIndex, 0x0363);
});
