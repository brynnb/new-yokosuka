import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/jomo-drawer-audio-scope.json", import.meta.url),
));

test("JOMO drawer evidence preserves the native selector boundary", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-drawer-audio-scope-v1",
  );
  assert.deepEqual(evidence.drawerRegistration, {
    objectTag: "ATS1",
    objectRecordFileOffset: "0x9b1c0",
    logicalActionId: 40,
    sharedObjectGroup: 0,
    groupFileOffset: "0x9b700",
    groupCallbackTokens: [
      {
        rawHex: "0x000b05a9",
        selector: 11,
        functionFileOffset: "0x11f50",
      },
      { rawHex: "0x00000000", selector: 0 },
      {
        rawHex: "0x000a05a9",
        selector: 10,
        functionFileOffset: "0x11ce0",
      },
      {
        rawHex: "0x006405a9",
        selector: 100,
        functionFileOffset: "0x58464",
      },
    ],
    runtimeTaskAddress: "0x0c810c40",
    model: "S1_JOMO_TANM4W3G.MT5",
  });
  assert.equal(evidence.selector11SoundRoute.logicalRecordWord, 9);
  assert.equal(evidence.selector11SoundRoute.sentinel, "0xffffffff");
  assert.deepEqual(
    evidence.selector11SoundRoute.readAndCallSites,
    [
      {
        readFileOffset: "0x12794",
        callFileOffset: "0x1280e",
        operationId: "0x006c",
      },
      {
        readFileOffset: "0x128e0",
        callFileOffset: "0x1295a",
        operationId: "0x006c",
      },
    ],
  );
});

test("all captured live logical sound slots remain unpopulated", () => {
  assert.deepEqual(evidence.summary, {
    captureCount: 3,
    logicalRecordCountPerCapture: 18,
    logicalSoundWordCountPerRecord: 4,
    inspectedLogicalSoundWordCount: 216,
    nonSentinelLogicalSoundWordCount: 0,
    runtimePolicy: "logical-record-path-empty",
  });
  assert.deepEqual(
    evidence.captures.map((capture) => capture.frameCount),
    [147, 156, 160],
  );
  for (const capture of evidence.captures) {
    assert.equal(capture.moduleRuntimeBase, "0x0c3c5740");
    assert.equal(capture.scriptContextRuntimeAddress, "0x0c4963ac");
    assert.equal(capture.ats1TaskTag, "ATS1");
    assert.equal(capture.logicalRecords.length, 18);
    assert.equal(capture.nonSentinelLogicalSoundRecordCount, 0);
    for (const record of capture.logicalRecords) {
      assert.deepEqual(record.soundWords, [
        "0xffffffff",
        "0xffffffff",
        "0xffffffff",
        "0xffffffff",
      ]);
    }
  }
});

test("drawer logical slots stay separate from proven phase commands", () => {
  assert.match(
    evidence.semanticBoundary.rejected.join(" "),
    /STAN or scheduled-actor/,
  );
  assert.match(
    evidence.semanticBoundary.unresolved.join(" "),
    /F1OMOYAA A905 commands/,
  );
});
