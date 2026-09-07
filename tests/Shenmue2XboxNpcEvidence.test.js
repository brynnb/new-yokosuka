import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidence = JSON.parse(fs.readFileSync(new URL(
  "../tools/evidence/shenmue2-xbox-npc-structure.json",
  import.meta.url,
)));

test("Xbox NPC evidence is tied to the supplied executable", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-shenmue2-xbox-npc-structure-v3",
  );
  assert.equal(
    evidence.generatedFrom.defaultXbe.sha256,
    "0d4d7b27a650e05e736039039a805495f21b3adb2021e6cc1aeb47ab9ae7e4b6",
  );
  assert.equal(evidence.xboxExecutable.npcBinString.fileOffset, "0x464a34");
  assert.equal(
    evidence.xboxExecutable.npcBinString.virtualAddress,
    "0x4725b4",
  );
  assert.ok(evidence.xboxExecutable.npcBinString.pointerReferences.some(
    (reference) => reference.virtualAddress === "0xa0a0e",
  ));
});

test("Xbox executable supplies the complete native NPC opcode widths", () => {
  assert.deepEqual(evidence.xboxExecutable.npcOpcodeWordCounts, {
    virtualAddress: "0x4ec108",
    fileOffset: "0x4dee88",
    entryCount: 59,
    unit: "32-bit words",
    values: [
      1, 2, 2, 2, 3, 2, 2, 5, 6, 4, 3, 5, 3, 2, 2, 3,
      7, 2, 3, 2, 2, 2, 2, 2, 2, 6, 2, 3, 2, 4, 5, 3,
      2, 2, 5, 5, 2, 3, 4, 3, 9, 2, 4, 5, 3, 3, 2, 2,
      3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2,
    ],
  });
  const operations = evidence.dreamcastNpc.actors.flatMap(
    (actor) => actor.programs.flatMap((program) => program.operations),
  );
  assert.ok(operations.length > 5000);
  assert.ok(operations.every((operation) => {
    const opcode = Number(operation.opcode);
    return opcode >= 0
      && opcode < evidence.xboxExecutable.npcOpcodeWordCounts.entryCount
      && operation.arguments.length
        === evidence.xboxExecutable.npcOpcodeWordCounts.values[opcode] - 1;
  }));
});

test("Xbox dispatcher proves opcode 0x2d motion-layer width and routing", () => {
  const site = evidence.xboxExecutable.staticCodeSites.find(
    (candidate) => candidate.virtualAddress === "0x5f89a",
  );
  assert.match(site.observation, /advances 12 bytes/);
  const programs = evidence.dreamcastNpc.actors.flatMap(
    (actor) => actor.programs,
  );
  const poses = programs.flatMap((program) => program.operations)
    .filter((operation) => operation.opcode === "0x2d");
  assert.equal(poses.length, 7);
  assert.ok(poses.every(
    (operation) => operation.arguments.length === 2
      && operation.arguments[1] === "0x10",
  ));
});

test("Fortune and Worker's Pier NPC files are identical on Xbox and DC", () => {
  for (const filename of ["NPC_AK09.BIN", "NPC_AR02.BIN"]) {
    const comparison = evidence.comparisons.find(
      (candidate) => candidate.filename === filename,
    );
    assert.equal(comparison?.identical, true, filename);
    assert.equal(comparison.dreamcast.sha256, comparison.xbox.sha256);
  }
  assert.equal(
    evidence.comparisons.filter((comparison) => comparison.identical).length,
    14,
  );
});

test("native actor evidence retains exact records, nodes, and packed times", () => {
  const actor = evidence.dreamcastNpc.actors.find(
    (candidate) => candidate.actorCode === "00A_",
  );
  assert.equal(actor.sourceOffset, "0x7d4");
  const workerProgram = actor.programs.find(
    (program) => program.nodeReferences[0]?.id === "ARX4",
  );
  assert.equal(workerProgram.sourceOffset, "0x82c");
  assert.deepEqual(workerProgram.packedTimes[0], {
    opcode: 1,
    packed: "0x1200",
    hour: 18,
    minute: 0,
    second: 64800,
    sourceOffset: "0x880",
  });
  assert.equal(workerProgram.nodeReferences[0].nodeSourceOffset, "0x27d40");
});
