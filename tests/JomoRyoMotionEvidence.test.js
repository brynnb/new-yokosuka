import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/jomo-ryo-motion-evidence.json",
    import.meta.url,
  ),
));

test("frozen JOMO matrices identify Ryo's native idle motion", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-ryo-motion-evidence-v1",
  );
  assert.deepEqual(
    evidence.source.captures.map((capture) => [
      capture.frameCount,
      capture.motmCurrentFrame,
      capture.motmRenderedFrame,
    ]),
    [
      [147, 12, 11],
      [156, 21, 20],
      [160, 25, 24],
    ],
  );
  assert.deepEqual(
    {
      index: evidence.match.winner.sequenceIndex,
      name: evidence.match.winner.sequenceName,
      frames: evidence.match.winner.durationFrames,
    },
    {
      index: 902,
      name: "AKI_AKI_TATI_IWA_L",
      frames: 60,
    },
  );
  assert.ok(evidence.match.winner.relativeDeltaError < 0.06);
  assert.ok(evidence.match.runnerUpErrorRatio > 18);
});

test("the matched player idle owns no authored audio cue", () => {
  assert.deepEqual(evidence.authoredAudio.soundCues, []);
  assert.deepEqual(evidence.authoredAudio.surfaceSoundCues, []);
  assert.equal(
    evidence.evidenceBoundary.policy,
    "keep-drawer-command-unresolved-no-guessed-mapping",
  );
  assert.match(
    evidence.match.interpretation,
    /do not show a drawer-specific Ryo interaction motion/,
  );
});
