import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  EXPECTED_EXECUTABLE_SHA256,
  assignCallsToTelmStates,
  extractTelmSoundCalls,
  extractTelmStateTargets,
  nativeCommandHex,
} from "../tools/lib/NativeTelmAudio.mjs";

const executablePath = path.resolve(
  ".disc-work/exact/1ST_READ.BIN",
);
const executableAvailable = (() => {
  try {
    return readFileSync(executablePath);
  } catch {
    return null;
  }
})();

test("native TELM command words retain Dreamcast little-endian byte order", () => {
  assert.equal(nativeCommandHex(0x000705ab), "ab050700");
  assert.equal(nativeCommandHex(0x000206ab), "ab060200");
});

test(
  "known executable yields the exact TELM state table and sound calls",
  { skip: !executableAvailable },
  () => {
    const states = extractTelmStateTargets(executableAvailable);
    const calls = extractTelmSoundCalls(executableAvailable);
    const assigned = assignCallsToTelmStates(
      executableAvailable,
      calls,
      states,
    );

    assert.equal(EXPECTED_EXECUTABLE_SHA256.length, 64);
    assert.equal(states.length, 22);
    assert.equal(states[0].targetAddress, 0x0c16d6d0);
    assert.equal(states[21].targetAddress, 0x0c16f8a8);
    assert.equal(calls.length, 24);
    assert.deepEqual(
      [...new Set(calls.map(({ commandHex }) => commandHex))].sort(),
      [
        "ab050000",
        "ab050100",
        "ab050200",
        "ab050300",
        "ab050600",
        "ab050700",
        "ab060000",
        "ab060100",
        "ab060200",
        "ab060300",
      ],
    );
    assert.deepEqual(
      assigned.states[18].soundCallAddresses,
      [0x0c16dc98, 0x0c16dcaa],
    );
    assert.deepEqual(
      assigned.states[21].soundCallAddresses,
      [],
    );
    assert.deepEqual(
      assigned.calls
        .filter(({ reachableFromStates }) => reachableFromStates.length === 0)
        .map(({ callAddress }) => callAddress),
      [0x0c16d4ac],
    );
  },
);
