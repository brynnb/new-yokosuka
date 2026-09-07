import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CUTSCENES } from "../play/config/cutscenes.js";
import {
  createNativeEventInterpreter,
} from "../play/events/NativeEventInterpreter.js";
import {
  createNativeActorByteState,
} from "../play/events/NativeActorByteState.js";
import {
  createNativeEventOperationExecutor,
  createNativeOperation0050SemanticHandlers,
  createNativeOperation013eSemanticHandlers,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  createNativeRuntimeInterfaceExecutor,
} from "../play/events/NativeRuntimeInterface.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../play/events/NativeSceneGameplayState.js";
import {
  createNativeScriptedEventRuntime,
} from "../play/events/NativeScriptedEventRuntime.js";

const previewPack = JSON.parse(fs.readFileSync(
  "play/data/events/nativeActivityPreviewPrograms.generated.json",
  "utf8",
));
const runtimePack = JSON.parse(fs.readFileSync(
  "play/data/events/nativeEventPrograms.generated.json",
  "utf8",
));

test("generated activity previews are ordinary canonical interpreter programs", async () => {
  assert.equal(
    previewPack.schema,
    "new-yokosuka-native-activity-preview-program-pack-v1",
  );
  assert.equal(
    previewPack.programs.length,
    CUTSCENES.filter(item => item.program?.entryFunction?.startsWith("$activity"))
      .length,
  );
  const program = previewPack.programs.find(
    item => item.selector.cutsceneId === "S1-DRAUTH-01",
  );
  assert.equal(program.id, "preview-s1-drauth-01");
  assert.equal(program.functions.length, 1);
  assert.equal(program.functions[0].entryBlock, "$activity-preview:bind");
  assert.deepEqual(
    program.functions[0].blocks.flatMap(block => block.actions)
      .map(action => action.semanticId),
    [
      "native-operation-013e-resource-slot-control",
      "native-operation-0050-aseq-activity-control",
      "native-scheduler-countdown",
      "native-coroutine-continuation-transfer",
      "native-operation-0050-aseq-activity-control",
    ],
  );
  assert.equal(
    runtimePack.programs.filter(item => item.id === program.id).length,
    1,
  );

  const cutscene = CUTSCENES.find(item => item.id === "S1-DRAUTH-01");
  assert.deepEqual(cutscene.program, {
    programId: program.id,
    entryFunction: program.entryFunction,
    area: program.area,
    worldId: program.preview.worldId,
  });
  assert.equal(cutscene.activity, undefined);
  for (const wrapper of previewPack.programs) {
    const selection = CUTSCENES.find(
      item => item.id === wrapper.selector.cutsceneId,
    );
    assert.ok(selection, wrapper.selector.cutsceneId);
    assert.equal(selection.activity, undefined);
    assert.deepEqual(selection.program, {
      programId: wrapper.id,
      entryFunction: wrapper.entryFunction,
      area: wrapper.area,
      worldId: wrapper.preview.worldId,
    });
    assert.equal(
      runtimePack.programs.filter(item => item.id === wrapper.id).length,
      1,
    );
  }

  const sceneState = createNativeSceneGameplayState();
  sceneState.prepareNativeOperation013eBindings(program);
  const context = createNativeSceneFieldRuntimeContext(sceneState);
  const stopped = [];
  const executeOperation = createNativeEventOperationExecutor({
    handlers: {
      ...createNativeOperation013eSemanticHandlers(),
      ...createNativeOperation0050SemanticHandlers({
        startActivity: async ({ slot, binding }) => {
          assert.equal(slot, 0);
          assert.deepEqual(binding, {
            primaryPointer: 0xb138a,
            secondaryPointer: 0xb1391,
          });
          return {
            activityId: "DRAUTH/SEQDATA1.AUTH",
            durationFrames: 2,
          };
        },
        stopActivity: async detail => (stopped.push(detail), true),
      }),
    },
  });
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation,
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });

  const first = await interpreter.run(null, context);
  assert.equal(first.status, "yielded");
  assert.equal(sceneState.readNativeOperation0050Activity().currentFrame, 0);
  sceneState.advanceNativeOperation0050Activity();
  const second = await interpreter.run(first.state, context);
  assert.equal(second.status, "yielded");
  sceneState.advanceNativeOperation0050Activity();
  const third = await interpreter.run(second.state, context);
  assert.equal(third.status, "completed");
  assert.equal(sceneState.readNativeOperation0050Activity(), null);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].reason, "complete");
});

test("exact activity sequences retain one canonical lease and authored repeats", async () => {
  const program = previewPack.programs.find(
    item => item.selector.cutsceneId === "S1-EVSN-01",
  );
  assert.equal(program.entryFunction, "$activity-sequence");
  assert.equal(program.preview.kind, "exact-auth-activity-sequence-v1");
  assert.deepEqual(
    program.preview.activities.map(activity => activity.slot),
    [0, 1, 1, 2],
  );
  assert.equal(program.functions.length, 1);
  assert.equal(program.functions[0].blocks.length, 17);

  const sceneState = createNativeSceneGameplayState();
  sceneState.prepareNativeOperation013eBindings(program);
  const context = createNativeSceneFieldRuntimeContext(sceneState);
  const started = [];
  const stopped = [];
  const executeOperation = createNativeEventOperationExecutor({
    handlers: {
      ...createNativeOperation013eSemanticHandlers(),
      ...createNativeOperation0050SemanticHandlers({
        startActivity: async ({ slot }) => {
          started.push(slot);
          return {
            activityId: `EVSN/slot-${slot}`,
            durationFrames: 1,
          };
        },
        stopActivity: async detail => (stopped.push(detail), true),
      }),
    },
  });
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation,
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  let state = null;
  let result = null;
  for (let index = 0; index < 12; index += 1) {
    result = await interpreter.run(state, context);
    if (result.status === "completed") break;
    assert.equal(result.status, "yielded");
    state = result.state;
    sceneState.advanceNativeOperation0050Activity();
  }
  assert.equal(result.status, "completed");
  assert.deepEqual(started, [0, 1, 1, 2]);
  assert.equal(stopped.length, 4);
});

test("activity preview wrappers complete through NativeScriptedEventRuntime", async () => {
  const program = previewPack.programs.find(
    item => item.selector.cutsceneId === "S1-DRAUTH-01",
  );
  const sceneState = createNativeSceneGameplayState();
  sceneState.prepareNativeOperation013eBindings(program);
  const context = createNativeSceneFieldRuntimeContext(sceneState);
  const stopped = [];
  const handlers = {
    ...createNativeOperation013eSemanticHandlers(),
    ...createNativeOperation0050SemanticHandlers({
      startActivity: async () => ({
        activityId: "DRAUTH/SEQDATA1.AUTH",
        durationFrames: 2,
      }),
      stopActivity: async detail => (stopped.push(detail), true),
    }),
  };
  let resolveSettlement;
  const settlement = new Promise(resolve => { resolveSettlement = resolve; });
  const runtime = createNativeScriptedEventRuntime({
    programPack: {
      schema: "new-yokosuka-native-event-program-pack-v1",
      programs: [program],
    },
    actorByteState: createNativeActorByteState(),
    createExecution: () => ({
      context,
      handlers,
      update() {
        sceneState.advanceNativeOperation0050Activity();
      },
      commit() {},
      rollback() {},
    }),
    onComplete: resolveSettlement,
  });
  const started = await runtime.startProgram({
    programId: program.id,
    entryFunction: program.entryFunction,
    area: program.area,
  });
  assert.equal(started.status, "yielded");
  assert.equal(runtime.status, "continuation");
  runtime.update(1 / 30);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.status, "continuation");
  runtime.update(1 / 30);
  const completed = await settlement;
  assert.equal(completed.status, "completed");
  assert.equal(completed.programId, program.id);
  assert.equal(completed.entryFunction, program.entryFunction);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].reason, "complete");
});
