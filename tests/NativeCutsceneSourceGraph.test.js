import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const graph = JSON.parse(readFileSync(
  "play/assets/introduction/op02/cutscene-source-graph.generated.json",
  "utf8",
));
const program = JSON.parse(readFileSync(
  "play/assets/introduction/op02/cutscene-program.generated.json",
  "utf8",
));

test("OP02 source graph derives complete native activities and hawk compatibility", () => {
  assert.equal(graph.schema, "new-yokosuka-native-cutscene-source-graph-v1");
  assert.equal(graph.activities.length, 7);

  const hawkModels = graph.models.filter(model => model.nativeName.startsWith("TAK02M"));
  assert.deepEqual(hawkModels.map(model => [
    model.nativeName,
    model.hierarchy.nodeCount,
  ]), [
    ["TAK02M7G.CHRM", 58],
    ["TAK02M8G.CHRM", 54],
  ]);

  const hawkMotion = graph.motions.find(motion => motion.logicalId.endsWith("M_TORI.MOTN"));
  assert.equal(hawkMotion.format, "TMNM");
  assert.equal(hawkMotion.sequences.length, 8);
  assert.deepEqual(
    graph.motionCompatibility.map(binding => [
      binding.sequenceIndex,
      binding.requiredNodeCount,
      binding.compatibleModelIds.map(id => id.split("/").at(-1)),
    ]),
    [
      [0, 58, ["TAK02M7G.CHRM"]],
      [1, 58, ["TAK02M7G.CHRM"]],
      [2, 58, ["TAK02M7G.CHRM"]],
      [3, 58, ["TAK02M7G.CHRM"]],
      [4, 58, ["TAK02M7G.CHRM"]],
      [5, 54, ["TAK02M8G.CHRM"]],
      [6, 54, ["TAK02M8G.CHRM"]],
      [7, 54, ["TAK02M8G.CHRM"]],
    ],
  );
});

test("OP02 source graph retains its exact music dependency", () => {
  assert.deepEqual(graph.audio.music.map(value => ({
    nativeName: value.nativeName,
    trackId: value.trackId,
    groupCommand: value.groupCommand,
  })), [{
    nativeName: "bgm019.snd",
    trackId: "bgm019",
    groupCommand: "A82B0000",
  }]);
  assert.deepEqual(graph.audio.ownerCommands, [
    {
      commandHex: "a82b0000",
      exactArguments: [0, 0],
      kind: "music",
      trackId: "bgm019",
      callFileOffsets: ["0x192"],
    },
    {
      commandHex: "a0040000",
      exactArguments: [2, 100],
      kind: "native-control-no-output",
      constructedQueueWord: "0x00000002",
      byteReversedDriverWord: "0x02000000",
      callFileOffsets: ["0x1aa"],
    },
    {
      commandHex: "a00a0000",
      exactArguments: [2, 30],
      kind: "native-control-no-output",
      constructedQueueWord: "0x00000002",
      byteReversedDriverWord: "0x02000000",
      callFileOffsets: ["0x1892", "0x1986"],
    },
  ]);
  assert.equal(graph.compile.status, "compiled");
  assert.equal(program.schema, "new-yokosuka-native-cutscene-program-v1");
  assert.equal(program.entryFunction, "0x23c8");
  assert.deepEqual(program.entryInvocation, {
    sourceFunction: "0x2154",
    callFileOffset: "0x2188",
    arguments: [{
      kind: "constant",
      value: 0x52494b41,
      hex: "0x52494b41",
      ascii: "AKIR",
      source: "0x2172",
    }],
    frameArgumentBase: 12,
    initialFrameFields: { 12: 0x52494b41 },
  });
  assert.equal(program.summary.functionCount, 13);
  assert.equal(program.summary.blockCount, 397);
  assert.equal(program.summary.actionCount, 265);
  assert.equal(program.summary.actionKinds.frameFieldExpressionWrite, 17);
  const ownerRoutine = program.functions.find(value => value.id === "0x7c");
  assert.equal(ownerRoutine.specializedReachableBlockCount, 266);
  assert.equal(ownerRoutine.blocks.some(value => value.id === "0x1fa"), false);
  assert.deepEqual(
    ownerRoutine.blocks.flatMap(value => value.actions).find(value => (
      value.kind === "frameFieldExpressionWrite"
      && value.callFileOffset === "0x1e8"
    )),
    {
      kind: "frameFieldExpressionWrite",
      callFileOffset: "0x1e8",
      offset: 0,
      width: 4,
      expression: {
        kind: "frame-field",
        offset: 144,
        width: 4,
        signedLoad: false,
      },
    },
  );
  assert.equal(program.summary.unresolvedOperationTypeCount, 0);
  assert.equal(program.summary.unresolvedOperationCallCount, 0);
  assert.deepEqual(
    graph.compile.blockers.map(value => value.operationHex),
    program.compile.blockers.map(value => value.operationHex),
  );
});
