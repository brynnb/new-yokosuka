import assert from "node:assert/strict";
import test from "node:test";
import { CUTSCENES } from "../play/config/cutscenes.js";
import {
  completionTimeoutForCutscene,
  playbackExpectationForCutscene,
} from "./e2e/cutscene-preview-timeout.js";

test("browser expectations cover every current preview with its chosen cinematic sequence", () => {
  for (const cutscene of CUTSCENES) {
    const expected = playbackExpectationForCutscene(cutscene.id);
    assert.equal(expected.programId, cutscene.program.programId);
    assert.ok(expected.activityOrder.length > 0);
    assert.equal(expected.activityOrder.length, expected.activityDurations.length);
    assert.ok(completionTimeoutForCutscene(cutscene.id) > expected.durationFrames / 30 * 1000);
  }
  const rescue = playbackExpectationForCutscene("S1-EVSN-01");
  assert.deepEqual(rescue.activityOrder, [1, 2, 3].map(i => `EVSN/SEQDATA${i}.AUTH`));
  assert.deepEqual(rescue.activityDurations, [230, 1671, 1080]);
  assert.equal(rescue.durationFrames, 2981);
  const nightmare = playbackExpectationForCutscene("S1-BEBF-01");
  assert.deepEqual(nightmare.activityDurations, [260, 700, 370]);
  assert.equal(nightmare.durationFrames, 1330);
  assert.deepEqual(playbackExpectationForCutscene("S1-CATA1-01").attachedActorTags,
    ["NBO1", "NBO2", "NBO3", "ABRG"]);
  assert.deepEqual(playbackExpectationForCutscene("S1-BUSS-03").propCheckpoints
    .filter(cue => cue.activityId === "BUSS/SEQDATA2.AUTH").map(cue => cue.frame), [0, 132]);
  assert.ok(playbackExpectationForCutscene("S1-TOKI-01").propCheckpoints.some(cue => cue.frame === 1972));
  assert.deepEqual(playbackExpectationForCutscene("S1-000").activityOrder,
    [0, 1, 2, 3, 4, 18, 19, 5, 6, 7, 8, 9, 10, 11, 12, 13, 22, 23, 14, 15, 16, 17, 20, 21, 24]
      .map(slot => `OP00/SEQDATA${slot}.AUTH`));
  const spans = playbackExpectationForCutscene("S1-000").musicSpans;
  assert.deepEqual(spans.map(span => span.trackId), ["op00-open1", "op00-open2"]);
  assert.ok(spans[0].durationSeconds > 80);
  assert.ok(spans[1].durationSeconds > 240);
  assert.deepEqual(playbackExpectationForCutscene("S1-OP00-DREAM").musicSpans
    .map(span => span.trackId), ["bgm120", "op00-dream-tsm006"]);
  assert.throws(() => playbackExpectationForCutscene("not-a-scene"), /No preview program/);
});
