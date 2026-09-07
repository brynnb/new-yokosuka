import assert from "node:assert/strict";
import test from "node:test";

import {
  createNativeEventInterpreter,
} from "../play/events/NativeEventInterpreter.js";
import {
  createNativeRuntimeInterfaceExecutor,
} from "../play/events/NativeRuntimeInterface.js";
import {
  createNativeClockRecordSemanticHandlers,
  createNativeEventOperationExecutor,
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "../play/events/NativeEventOperationRuntime.js";
import {
  evaluateNativeFrameFieldComparison,
  evaluateNativeSceneFieldComparison,
} from "../play/events/NativeEventPredicate.js";

function operation(offset, semanticId = "proven-operation") {
  return {
    kind: "engineOperation",
    callFileOffset: offset,
    operationHex: "0x0001",
    adapterStatus: "proven",
    semanticId,
    arguments: [],
  };
}

function comparison() {
  return {
    fieldOffset: "0x84",
    loadWidth: 4,
    signedLoad: false,
    comparison: "cmp/ge",
    leftOperand: "r5",
    rightOperand: "r4",
    fieldOperand: "r4",
    constantOperand: "r5",
    constant: 6,
    fieldLoadFileOffset: "0x100",
    compareFileOffset: "0x108",
    resolvedBranch: {
      branchFileOffset: "0x10a",
      comparisonTrueSuccessor: "0x120",
      comparisonFalseSuccessor: "0x110",
    },
  };
}

test("native record copies update the current interpreter frame", async () => {
  let observedHour;
  const clockOperation = {
    ...operation("0x102", "native-clock-record-copy"),
    operationHex: "0x0059",
    arguments: [{
      kind: "frame-address",
      offset: 4,
    }],
  };
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [
          clockOperation,
          operation("0x104", "inspect-clock-hour"),
        ],
        successors: [],
      }],
    }],
  };
  const executeClock = createNativeEventOperationExecutor({
    handlers: createNativeClockRecordSemanticHandlers({
      readNativeClockRecord: () => [86, 12, 3, 2, 14, 30, 45],
    }),
  });
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: (action, context) => {
      if (action.semanticId === "native-clock-record-copy") {
        return executeClock(action, context);
      }
      observedHour = context.readFrameField(8);
      return { status: "continued" };
    },
  });
  assert.equal((await interpreter.run()).status, "completed");
  assert.equal(observedHour, 14);
});

test("executes exact scene-field bitwise OR writes", async () => {
  const fields = new Map([[0xb0, 0x80]]);
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "sceneFieldBitwiseWrite",
          callFileOffset: "0x108",
          offset: 0xb0,
          width: 1,
          operator: "or",
          mask: 1,
        }],
        successors: [],
      }],
    }],
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: () => ({ status: "continued" }),
  });
  const result = await interpreter.run(null, {
    readSceneField: ({ offset }) => fields.get(offset),
    writeSceneField: ({ offset, value }) => fields.set(offset, value),
  });
  assert.equal(result.status, "completed");
  assert.equal(fields.get(0xb0), 0x81);
});

test("evaluates immediate zero comparisons after a field transfer to r0", () => {
  const comparison = {
    fieldOffset: "0xb0",
    loadWidth: 1,
    signedLoad: true,
    comparison: "cmp/eq",
    leftOperand: "#0",
    rightOperand: "r0",
    fieldOperand: "r4",
    constantOperand: "#0",
    constant: 0,
    resolvedBranch: {
      comparisonTrueSuccessor: "0x110",
      comparisonFalseSuccessor: "0x120",
    },
  };
  assert.deepEqual(evaluateNativeSceneFieldComparison(comparison, {
    readSceneField: () => 0,
  }), {
    resolved: true,
    value: true,
    successor: "0x110",
    reason: null,
  });
  assert.deepEqual(evaluateNativeSceneFieldComparison(comparison, {
    readSceneField: () => 1,
  }), {
    resolved: true,
    value: false,
    successor: "0x120",
    reason: null,
  });
});

function branchingProgram() {
  return {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      unresolvedControlTransfers: [],
      blocks: [
        {
          id: "0x100",
          endFileOffsetExclusive: "0x10c",
          actions: [],
          sceneFieldComparisons: [comparison()],
          terminator: { fileOffset: "0x10a", mnemonic: "bf" },
          successors: ["0x120", "0x110"],
        },
        {
          id: "0x110",
          endFileOffsetExclusive: "0x118",
          actions: [operation("0x112", "when-false")],
          sceneFieldComparisons: [],
          successors: [],
        },
        {
          id: "0x120",
          endFileOffsetExclusive: "0x128",
          actions: [operation("0x122", "when-true")],
          sceneFieldComparisons: [],
          successors: [],
        },
      ],
    }],
  };
}

test("evaluates exact SH-4 comparison operand direction", () => {
  assert.deepEqual(
    evaluateNativeSceneFieldComparison(comparison(), {
      readSceneField: ({ offset, width }) => {
        assert.equal(offset, 0x84);
        assert.equal(width, 4);
        return 9;
      },
    }),
    {
      resolved: true,
      value: true,
      successor: "0x120",
      reason: null,
    },
  );
});

test("evaluates exact native scene-field bit tests", () => {
  const result = evaluateNativeSceneFieldComparison({
    fieldOffset: "0x105",
    loadWidth: 1,
    signedLoad: true,
    comparison: "bit-mask-equal-zero",
    mask: 0x10,
    resolvedBranch: {
      comparisonTrueSuccessor: "0x110",
      comparisonFalseSuccessor: "0x120",
    },
  }, {
    readSceneField: () => 0x10,
  });
  assert.equal(result.resolved, true);
  assert.equal(result.value, false);
  assert.equal(result.successor, "0x120");
});

test("evaluates exact coroutine-frame comparisons from supplied state", () => {
  assert.equal(evaluateNativeFrameFieldComparison({
    ...comparison(),
    fieldOffset: 20,
  }, {
    readFrameField: offset => (offset === 20 ? 9 : undefined),
  }).value, true);
});

test("evaluates exact comparisons between two coroutine-frame fields", () => {
  const result = evaluateNativeFrameFieldComparison({
    fieldOffset: 9,
    loadWidth: 1,
    signedLoad: true,
    otherFieldOffset: 21,
    otherLoadWidth: 1,
    otherSignedLoad: true,
    comparison: "cmp/eq",
    leftOperand: "r5",
    rightOperand: "r4",
    fieldOperand: "r5",
    otherFieldOperand: "r4",
    resolvedBranch: {
      comparisonTrueSuccessor: "0x110",
      comparisonFalseSuccessor: "0x120",
    },
  }, {
    readFrameField: offset => ({ 9: 12, 21: 12 })[offset],
  });
  assert.equal(result.resolved, true);
  assert.equal(result.value, true);
  assert.equal(result.successor, "0x110");
});

test("evaluates exact compound float frame predicates", () => {
  const comparison = {
    comparison: "frame-expression",
    expression: {
      kind: "equal",
      left: { kind: "constant", value: 0 },
      right: {
        kind: "boolean-mask",
        operand: {
          kind: "float32-greater-than",
          left: {
            kind: "float32-from-word",
            operand: {
              kind: "frame-field",
              offset: 4,
              width: 4,
              signedLoad: false,
            },
          },
          right: {
            kind: "float32-from-word",
            operand: { kind: "constant", value: nativeFloat32Word(50) },
          },
        },
      },
    },
    resolvedBranch: {
      comparisonTrueSuccessor: "0x116",
      comparisonFalseSuccessor: "0x120",
    },
  };
  assert.deepEqual(evaluateNativeFrameFieldComparison(comparison, {
    readFrameField: () => nativeFloat32Word(55),
  }), {
    resolved: true,
    value: false,
    successor: "0x120",
    reason: null,
  });
});

test("follows exactly one proven scene-field branch", async () => {
  const calls = [];
  const interpreter = createNativeEventInterpreter({
    program: branchingProgram(),
    readSceneField: () => 4,
    executeOperation: async action => {
      calls.push(action.semanticId);
    },
  });
  const result = await interpreter.run();
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["when-false"]);
});

test("direct calls return to the exact following action", async () => {
  const calls = [];
  const program = {
    entryFunction: "0x100",
    functions: [
      {
        id: "0x100",
        entryBlock: "0x100",
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [
            {
              kind: "directCall",
              callFileOffset: "0x102",
              targetFileOffset: "0x200",
            },
            operation("0x104", "after-call"),
          ],
          successors: [],
        }],
      },
      {
        id: "0x200",
        entryBlock: "0x200",
        blocks: [{
          id: "0x200",
          endFileOffsetExclusive: "0x210",
          actions: [operation("0x202", "callee")],
          successors: [],
        }],
      },
    ],
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: action => calls.push(action.semanticId),
  });
  assert.equal((await interpreter.run()).status, "completed");
  assert.deepEqual(calls, ["callee", "after-call"]);
});

test("direct calls materialize exact literal and forwarded frame arguments", async () => {
  const observed = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      frameArgumentBase: 16,
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "directCall",
          callFileOffset: "0x104",
          targetFileOffset: "0x200",
          argumentRecovery: "exact-stack-cleanup",
          arguments: [{
            kind: "constant",
            value: 18,
          }, {
            kind: "frame-field",
            offset: 7,
            width: 1,
          }, {
            kind: "caller-argument",
            index: 0,
            frameOffset: 16,
          }],
        }],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      frameArgumentBase: 40,
      blocks: [{
        id: "0x200",
        endFileOffsetExclusive: "0x210",
        actions: [operation("0x202", "observe-arguments")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed.push(
        context.readFrameField(40),
        context.readFrameField(44),
        context.readFrameField(48),
      );
      return { status: "continued" };
    },
  }).run(null, {
    initialFrameFields: { 7: 2, 16: 23 },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(observed, [18, 2, 23]);
});

test("unresolved direct-call arguments remain unavailable", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "directCall",
          callFileOffset: "0x104",
          targetFileOffset: "0x200",
          argumentRecovery: "unresolved",
          arguments: [],
        }],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      frameArgumentBase: 8,
      blocks: [{
        id: "0x200",
        endFileOffsetExclusive: "0x210",
        actions: [operation("0x202", "observe-unresolved")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(8);
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(observed, undefined);
});

test("propagates an exact masked direct-call return into its caller frame", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "directCall",
          callFileOffset: "0x104",
          targetFileOffset: "0x200",
          resultTarget: { kind: "frameField", offset: 0 },
        }, operation("0x106", "observe-return")],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      returnValue: {
        kind: "frame-field-mask",
        offset: 3,
        width: 1,
        mask: 0x80,
      },
      blocks: [{
        id: "0x200",
        endFileOffsetExclusive: "0x210",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x204",
          offset: 3,
          width: 1,
          value: 0xffffffff,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(0);
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(observed, 0x80);
});

test("propagates an exact signed byte direct-call return", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "directCall",
          callFileOffset: "0x104",
          targetFileOffset: "0x200",
          resultTarget: { kind: "frameField", offset: 0 },
        }, operation("0x106", "observe-return")],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      returnValue: {
        kind: "frame-field",
        offset: 7,
        width: 1,
        signedLoad: true,
      },
      blocks: [{
        id: "0x200",
        endFileOffsetExclusive: "0x210",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x204",
          offset: 7,
          width: 1,
          value: 0xff,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(0);
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(observed, 0xffffffff);
});

test("branches on an exact direct-call return comparison", async () => {
  const calls = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x108",
        actions: [{
          kind: "directCall",
          callFileOffset: "0x102",
          targetFileOffset: "0x200",
          resultComparison: {
            kind: "operationResult",
            comparison: "equal",
            constant: 1,
            resolvedBranch: {
              branchFileOffset: "0x10a",
              comparisonTrueSuccessor: "0x120",
              comparisonFalseSuccessor: "0x130",
            },
          },
        }],
        successors: ["0x108"],
      }, {
        id: "0x108",
        endFileOffsetExclusive: "0x10c",
        actions: [],
        terminator: { fileOffset: "0x10a", mnemonic: "bf" },
        successors: ["0x130", "0x120"],
      }, {
        id: "0x120",
        endFileOffsetExclusive: "0x128",
        actions: [operation("0x122", "matched")],
        successors: [],
      }, {
        id: "0x130",
        endFileOffsetExclusive: "0x138",
        actions: [operation("0x132", "not-matched")],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      returnValue: {
        kind: "frame-field",
        offset: 3,
        width: 1,
        signedLoad: true,
      },
      blocks: [{
        id: "0x200",
        endFileOffsetExclusive: "0x210",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x204",
          offset: 3,
          width: 1,
          value: 1,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: action => calls.push(action.semanticId),
  }).run();
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["matched"]);
});

test("reports an exact root function return value", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      returnValue: {
        kind: "frame-field",
        offset: 3,
        width: 1,
        signedLoad: true,
      },
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x104",
          offset: 3,
          width: 1,
          value: 18,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => ({ status: "continued" }),
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(result.returnValue, 18);
  assert.equal(result.state.returnValue, 18);
});

test("child launches preserve and resolve authored arguments", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "childCoroutineLaunch",
          callFileOffset: "0x104",
          targetFileOffset: "0x200",
          argumentCount: 2,
          arguments: [
            { kind: "constant", value: 7 },
            { kind: "frame-field", offset: 12 },
          ],
          resultTarget: { kind: "frameField", offset: 4, width: 4 },
        }, operation("0x106", "observe-child-handle")],
        successors: [],
      }],
    }],
  };
  const seen = [];
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      seen.push({ handle: context.readFrameField(4) });
      return { status: "continued" };
    },
    launchCoroutine: async (action, context) => {
      seen.push({
        target: action.targetFileOffset,
        first: context.readArgument(0),
        second: context.readArgument(1),
      });
      return { status: "launched", handle: 19 };
    },
  }).run(null, { initialFrameFields: { 12: 23 } });
  assert.equal(result.status, "completed");
  assert.deepEqual(seen, [
    { target: "0x200", first: 7, second: 23 },
    { handle: 19 },
  ]);
});

test("child launches select an exact typed-table operation result", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "engineOperation",
          callFileOffset: "0x102",
          adapterStatus: "proven",
          semanticId: "typed-indexed-table-access",
          arguments: [],
        }, {
          kind: "childCoroutineLaunch",
          callFileOffset: "0x104",
          targetFileOffsets: ["0x200", "0x300"],
          targetSource: {
            kind: "typed-table-operation-result",
            callFileOffset: "0x102",
          },
          targetTable: [{
            index: 0,
            relativeTarget: 0x180,
            targetFileOffset: "0x200",
          }, {
            index: 1,
            relativeTarget: 0x280,
            targetFileOffset: "0x300",
          }],
          argumentCount: 0,
          arguments: [],
        }],
        successors: [],
      }],
    }],
  };
  const launched = [];
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => ({ status: "continued", result: 0x280 }),
    launchCoroutine: action => {
      launched.push(action.targetFileOffset);
      return { status: "launched", handle: 1 };
    },
  }).run();

  assert.equal(result.status, "completed");
  assert.deepEqual(launched, ["0x300"]);
});

test("child launches select the last executed registered selector", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          ...operation("0x102", "typed-indexed-table-access"),
          arguments: [],
        }, {
          ...operation("0x104", "typed-indexed-table-access"),
          arguments: [],
        }, {
          kind: "childCoroutineLaunch",
          callFileOffset: "0x106",
          targetFileOffsets: ["0x200", "0x300", "0x400", "0x500"],
          targetSource: {
            kind: "registered-selector-operation-result",
            callFileOffsets: ["0x102", "0x104"],
            maximumExclusive: 4,
          },
          targetTable: ["0x200", "0x300", "0x400", "0x500"].map(
            (targetFileOffset, index) => ({ index, targetFileOffset }),
          ),
          argumentCount: 0,
          arguments: [],
        }],
        successors: [],
      }],
    }],
  };
  const launched = [];
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: action => ({
      status: "continued",
      result: action.callFileOffset === "0x102" ? 1 : 3,
    }),
    launchCoroutine: action => {
      launched.push(action.targetFileOffset);
      return { status: "launched", handle: 1 };
    },
  }).run();

  assert.equal(result.status, "completed");
  assert.deepEqual(launched, ["0x500"]);
});

test("child launches resolve an exact propagated function pointer", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x108",
        actions: [{
          kind: "childCoroutineLaunch",
          callFileOffset: "0x104",
          targetFileOffsets: ["0x200"],
          targetSource: {
            kind: "propagated-coroutine-function-pointer",
            frameOffset: 24,
            parameterIndex: 4,
          },
          targetTable: [{ nativeValue: 0x200, targetFileOffset: "0x200" }],
          argumentCount: 0,
          arguments: [],
        }],
        successors: [],
      }],
    }],
  };
  const launched = [];
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => ({ status: "continued" }),
    launchCoroutine: action => {
      launched.push(action.targetFileOffset);
      return { status: "launched", handle: 1 };
    },
  }).run(null, { initialFrameFields: { 24: 0x200 } });

  assert.equal(result.status, "completed");
  assert.deepEqual(launched, ["0x200"]);
});

test("yield state resumes after the yielding operation", async () => {
  const calls = [];
  const interpreter = createNativeEventInterpreter({
    program: {
      entryFunction: "0x100",
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [
            operation("0x102", "dialogue-start"),
            operation("0x104", "after-dialogue"),
          ],
          successors: [],
        }],
      }],
    },
    executeOperation: action => {
      calls.push(action.semanticId);
      return action.semanticId === "dialogue-start"
        ? { status: "yielded", request: { kind: "dialogue" } }
        : undefined;
    },
  });
  const first = await interpreter.run();
  assert.equal(first.status, "yielded");
  assert.deepEqual(first.request, { kind: "dialogue" });
  const second = await interpreter.run(first.state);
  assert.equal(second.status, "completed");
  assert.deepEqual(calls, ["dialogue-start", "after-dialogue"]);
});

test("executes exact typed frame additions with native dword wrapping", async () => {
  let observed;
  const interpreter = createNativeEventInterpreter({
    program: {
      entryFunction: "0x100",
      functions: [{
        id: "0x100",
        entryBlock: "0x100",
        blocks: [{
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            kind: "frameFieldAdd",
            callFileOffset: "0x104",
            offset: 0,
            width: 4,
            value: 1,
          }, operation("0x106", "observe")],
          successors: [],
        }],
      }],
    },
    executeOperation: (_action, context) => {
      observed = context.readFrameField(0);
    },
  });
  const result = await interpreter.run(null, {
    initialFrameFields: { 0: 0xffffffff },
  });
  assert.equal(result.status, "completed");
  assert.equal(observed, 0);
});

test("executes exact constant coroutine-frame writes", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x104",
          offset: 12,
          width: 4,
          value: 0x52494B41,
        }, operation("0x106", "observe-frame-write")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(12);
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(observed, 0x52494B41);
});

test("executes exact frame-field integer expression writes", async () => {
  const observed = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [{
          kind: "frameFieldExpressionWrite",
          callFileOffset: "0x104",
          offset: 9,
          width: 1,
          expression: {
            kind: "bitwise-and",
            left: {
              kind: "arithmetic-shift",
              operand: {
                kind: "frame-field",
                offset: 2,
                width: 1,
                signedLoad: true,
              },
              count: -5,
            },
            right: { kind: "constant", value: 7 },
          },
        }, {
          kind: "frameFieldExpressionWrite",
          callFileOffset: "0x106",
          offset: 4,
          width: 4,
          expression: {
            kind: "subtract",
            left: {
              kind: "add",
              left: {
                kind: "multiply",
                left: { kind: "frame-field", offset: 21, width: 1 },
                right: { kind: "constant", value: 31 },
              },
              right: { kind: "frame-field", offset: 22, width: 1 },
            },
            right: { kind: "frame-field", offset: 10, width: 1 },
          },
        }, operation("0x108", "observe-expressions")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed.push(context.readFrameField(9), context.readFrameField(4));
      return { status: "continued" };
    },
  }).run(null, {
    initialFrameFields: { 2: 0xe4, 10: 2, 21: 12, 22: 4 },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(observed, [7, 374]);
});

test("executes exact frame-field float32 conversion expressions", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [{
          kind: "frameFieldExpressionWrite",
          callFileOffset: "0x104",
          offset: 0,
          width: 4,
          expression: {
            kind: "float32-truncate-to-signed-integer",
            operand: {
              kind: "float32-multiply",
              left: {
                kind: "float32-divide",
                left: {
                  kind: "float32-from-word",
                  operand: { kind: "frame-field", offset: 24, width: 4 },
                },
                right: {
                  kind: "float32-from-word",
                  operand: { kind: "constant", value: 0x43b40000 },
                },
              },
              right: {
                kind: "signed-integer-to-float32",
                operand: { kind: "constant", value: 0x10000 },
              },
            },
          },
        }, operation("0x108", "observe-float-expression")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(0);
      return { status: "continued" };
    },
  }).run(null, {
    initialFrameFields: { 24: nativeFloat32Word(260) },
  });

  assert.equal(result.status, "completed");
  assert.equal(observed, 47331);
});

test("executes exact numeric operation-result transforms", async () => {
  let observed;
  const transformed = {
    ...operation("0x102", "scaled-uniform-random-float"),
    resultTransform: {
      kind: "float32-result-truncate-multiply-add",
      multiplier: 2,
      addend: 2950,
      resultTarget: {
        kind: "frameField",
        offset: 18,
        width: 2,
      },
    },
  };
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [
          transformed,
          operation("0x104", "observe-camera-number"),
        ],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (action, context) => {
      if (action.semanticId === "scaled-uniform-random-float") {
        return { result: nativeFloat32Word(2.8) };
      }
      observed = context.readFrameField(18);
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.equal(observed, 2954);
});

test("executes exact constant scene-field writes", async () => {
  const writes = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "sceneFieldWrite",
          callFileOffset: "0x104",
          offset: 0x105,
          width: 1,
          value: 0xffffffff,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
  }).run(null, {
    writeSceneField: detail => writes.push(detail),
  });
  assert.equal(result.status, "completed");
  assert.equal(writes[0].offset, 0x105);
  assert.equal(writes[0].value, 0xff);
});

test("copies and float32-adjusts exact scene fields into a frame", async () => {
  let observed;
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "frameFieldSceneWrite",
          callFileOffset: "0x102",
          offset: 4,
          width: 4,
          sceneOffset: 0xD8,
          floatAddendWord: nativeFloat32Word(1.6),
        }, operation("0x104", "observe-scene-copy")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (_action, context) => {
      observed = context.readFrameField(4);
      return { status: "continued" };
    },
  }).run(null, {
    readSceneField: ({ offset }) => (
      offset === 0xD8 ? nativeFloat32Word(2.5) : undefined
    ),
  });
  assert.equal(result.status, "completed");
  assert.equal(nativeFloat32FromWord(observed), Math.fround(4.1));
});

test("stops before unresolved operations and predicates", async () => {
  const unresolvedOperationProgram = branchingProgram();
  unresolvedOperationProgram.functions[0].entryBlock = "0x110";
  unresolvedOperationProgram.functions[0].blocks[1].actions[0] = {
    ...operation("0x112"),
    adapterStatus: "unresolved",
    semanticId: undefined,
    operationHex: "0x0195",
  };
  const operationResult = await createNativeEventInterpreter({
    program: unresolvedOperationProgram,
    executeOperation: () => assert.fail("must not execute"),
  }).run();
  assert.equal(operationResult.reason.kind, "unresolved-operation");

  const predicateResult = await createNativeEventInterpreter({
    program: branchingProgram(),
    executeOperation: () => assert.fail("must not execute"),
  }).run();
  assert.equal(predicateResult.reason.kind, "unresolved-branch-predicate");
  assert.match(predicateResult.reason.detail, /reader-missing/);
});

test("never crosses an unclassified indirect native call", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "indirectCall",
          callFileOffset: "0x104",
          operands: "@r1",
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
  }).run();
  assert.equal(result.reason.kind, "unresolved-indirect-call");
  assert.equal(result.reason.callFileOffset, "0x104");
});

test("stops at a classified runtime-interface call without guessing its handler", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "runtimeInterfaceCall",
          callFileOffset: "0x104",
          runtimeCallKind: "secondary-operation-dispatch",
          behaviorStatus: "handler-specific",
          targetSource: {
            kind: "base-register-slot",
            baseRegister: "r8",
            byteOffset: 48,
          },
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
  }).run();
  assert.equal(result.status, "stopped");
  assert.equal(result.reason.kind, "runtime-interface-call-unhandled");
  assert.equal(
    result.reason.runtimeCallKind,
    "secondary-operation-dispatch",
  );
});

function schedulerProgram(countdown) {
  const resultBitTest = {
    kind: "runtimeResultBit",
    mask: 0x00010000,
    resolvedBranch: {
      branchFileOffset: "0x114",
      comparisonTrueSuccessor: "0x130",
      comparisonFalseSuccessor: "0x120",
    },
  };
  return {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "runtimeInterfaceCall",
          callFileOffset: "0x104",
          runtimeCallKind: "resumable-scheduler-dispatch",
          behaviorStatus: "proven",
          semanticId: "native-scheduler-countdown",
          runtimeDispatch: {
            selector: 0,
            argumentCount: 1,
            arguments: [{ kind: "constant", value: countdown }],
          },
          resultBitTest,
        }],
        successors: ["0x110"],
      }, {
        id: "0x110",
        endFileOffsetExclusive: "0x116",
        actions: [],
        terminator: { fileOffset: "0x114", mnemonic: "bf" },
        successors: ["0x130", "0x120"],
      }, {
        id: "0x120",
        endFileOffsetExclusive: "0x128",
        actions: [{
          kind: "coroutineContinuationTransfer",
          callFileOffset: "0x122",
          semanticId: "native-coroutine-save-continuation",
        }],
        successors: ["0x130"],
      }, {
        id: "0x130",
        endFileOffsetExclusive: "0x138",
        actions: [],
        successors: [],
      }],
    }],
  };
}

test("executes selector-zero countdown and resumes its exact continuation", async () => {
  const interpreter = createNativeEventInterpreter({
    program: schedulerProgram(1),
    executeOperation: () => assert.fail("must not execute"),
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  const first = await interpreter.run();
  assert.equal(first.status, "yielded");
  assert.deepEqual(first.request.scheduler, {
    kind: "native-scheduler-countdown",
    ticks: 1,
    selector: 0,
    callFileOffset: "0x104",
    functionFileOffset: "0x100",
  });
  assert.equal((await interpreter.run(first.state)).status, "completed");
});

test("selector-zero countdown skips continuation when already ready", async () => {
  const result = await createNativeEventInterpreter({
    program: schedulerProgram(0),
    executeOperation: () => assert.fail("must not execute"),
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  }).run();
  assert.equal(result.status, "completed");
});

test("selector-zero countdown reads an exact coroutine frame field", async () => {
  const program = schedulerProgram(1);
  program.functions[0].blocks[0].actions[0].runtimeDispatch.arguments = [{
    kind: "frame-field",
    offset: 12,
    width: 4,
    signedLoad: false,
  }];
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  const first = await interpreter.run(null, {
    initialFrameFields: { 12: 3 },
  });
  assert.equal(first.status, "yielded");
  assert.equal(first.request.scheduler.ticks, 3);
  assert.equal((await interpreter.run(first.state)).status, "completed");
});

test("selector-nineteen readiness polling requires its exact adapter", async () => {
  const action = {
    semanticId: "native-scheduler-global-readiness",
    callFileOffset: "0x104",
    runtimeDispatch: {
      selector: 19,
      argumentCount: 0,
      arguments: [],
    },
    resultBitTest: { mask: 0x00010000 },
  };
  const unavailable = await createNativeRuntimeInterfaceExecutor()(action);
  assert.equal(unavailable.status, "stopped");
  assert.equal(unavailable.reason, "scheduler-global-readiness-query-missing");

  const waiting = await createNativeRuntimeInterfaceExecutor({
    querySchedulerGlobalReadiness: () => false,
  })(action, { location: { functionId: "0x100" } });
  assert.equal(waiting.result, 0);
  assert.deepEqual(waiting.continuation, {
    kind: "native-scheduler-global-readiness",
    ticks: 1,
    selector: 19,
    callFileOffset: "0x104",
    functionFileOffset: "0x100",
  });

  const ready = await createNativeRuntimeInterfaceExecutor({
    querySchedulerGlobalReadiness: () => true,
  })(action);
  assert.equal(ready.result, 0x00010000);
  assert.equal(ready.continuation, null);
});

test("signed runtime division feeds an exact scheduler countdown", async () => {
  const program = schedulerProgram(1);
  const scheduler = program.functions[0].blocks[0].actions[0];
  scheduler.runtimeDispatch.arguments = [{
    kind: "operation-result",
    source: "0x102",
    callFileOffset: "0x102",
  }];
  program.functions[0].blocks[0].actions.unshift({
    kind: "runtimeInterfaceCall",
    callFileOffset: "0x102",
    runtimeCallKind: "signed-integer-division",
    behaviorStatus: "proven",
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [{
        kind: "frame-field",
        offset: 12,
        width: 4,
        signedLoad: false,
      }, {
        kind: "constant",
        value: 2,
      }],
    },
  });
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  const first = await interpreter.run(null, {
    initialFrameFields: { 12: 7 },
  });
  assert.equal(first.status, "yielded");
  assert.equal(first.request.scheduler.ticks, 3);
  assert.equal((await interpreter.run(first.state)).status, "completed");
});

test("signed runtime remainder preserves the dividend sign", async () => {
  const execute = createNativeRuntimeInterfaceExecutor();
  const result = await execute({
    semanticId: "native-signed-integer-remainder",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [{
        kind: "frame-field",
        offset: 12,
        width: 4,
        signedLoad: false,
      }, {
        kind: "constant",
        value: 2,
      }],
    },
  }, {
    readFrameField: () => -7,
  });
  assert.equal(result.status, "continued");
  assert.equal(result.result | 0, -1);
});

test("signed runtime arithmetic evaluates exact SH-4 integer expressions", async () => {
  const execute = createNativeRuntimeInterfaceExecutor();
  const result = await execute({
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [{
        kind: "integer-expression",
        operator: "subtract",
        left: { kind: "constant", value: 20 },
        right: {
          kind: "integer-expression",
          operator: "multiply-low",
          left: { kind: "frame-field", offset: 8, width: 4, signedLoad: false },
          right: { kind: "constant", value: 0xFFFFFFB1 },
        },
      }, {
        kind: "frame-field",
        offset: 4,
        width: 4,
        signedLoad: false,
      }],
    },
  }, {
    readFrameField: (offset) => ({ 4: 3, 8: 2 })[offset],
  });
  assert.equal(result.status, "continued");
  assert.equal(result.result | 0, 59);
});

test("signed runtime arithmetic wraps exact SH-4 additions to 32 bits", async () => {
  const execute = createNativeRuntimeInterfaceExecutor();
  const result = await execute({
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [{
        kind: "integer-expression",
        operator: "add",
        left: { kind: "frame-field", offset: 8, width: 4, signedLoad: false },
        right: { kind: "constant", value: 0x80000000 },
      }, { kind: "constant", value: 2 }],
    },
  }, {
    readFrameField: () => 0x80000002,
  });
  assert.equal(result.status, "continued");
  assert.equal(result.result | 0, 1);
});

test("signed runtime arithmetic preserves native load width and source", async () => {
  const execute = createNativeRuntimeInterfaceExecutor();
  const descriptors = [];
  const frameResult = await execute({
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [
        { kind: "frame-field", offset: 30, width: 2, signedLoad: true },
        { kind: "constant", value: 10 },
      ],
    },
  }, {
    readFrameField: () => 0x0000fff6,
  });
  const sceneResult = await execute({
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [
        { kind: "scene-field", offset: 0x224, width: 1, signedLoad: true },
        { kind: "constant", value: 2 },
      ],
    },
  }, {
    readSceneField: descriptor => {
      descriptors.push(descriptor);
      return -7;
    },
  });
  assert.equal(frameResult.result | 0, -1);
  assert.equal(sceneResult.result | 0, -3);
  assert.deepEqual(descriptors, [{
    offset: 0x224,
    width: 1,
    signedLoad: true,
  }]);
});

test("signed runtime arithmetic preserves the native half-turn angle tie", async () => {
  const execute = createNativeRuntimeInterfaceExecutor();
  const action = {
    semanticId: "native-signed-integer-division",
    integerArithmetic: {
      argumentCount: 2,
      arguments: [{
        kind: "integer-expression",
        operator: "signed-binary-angle-difference",
        left: { kind: "frame-field", offset: 52, width: 4, signedLoad: false },
        right: { kind: "frame-field", offset: 16, width: 4, signedLoad: false },
      }, { kind: "constant", value: 1 }],
    },
  };
  const result = await execute(action, {
    readFrameField: offset => ({ 16: 0x8000, 52: 0 })[offset],
  });
  const wrapped = await execute(action, {
    readFrameField: offset => ({ 16: 1000, 52: 2000 })[offset],
  });
  assert.equal(result.result | 0, 0x8000);
  assert.equal(wrapped.result | 0, -1000);
});

test("stops before an unresolved secondary operation", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          kind: "secondaryEngineOperation",
          callFileOffset: "0x104",
          operationHex: "0x0003",
          dispatcher: "0x0c160918",
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => assert.fail("must not execute"),
  }).run();
  assert.equal(result.status, "stopped");
  assert.equal(result.reason.kind, "unresolved-secondary-operation");
  assert.equal(result.reason.operationHex, "0x0003");
});

test("native continuation transfer yields and resumes after the transfer", async () => {
  const calls = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [
          {
            kind: "coroutineContinuationTransfer",
            callFileOffset: "0x102",
            semanticId: "native-coroutine-save-continuation",
          },
          operation("0x104", "after-continuation"),
        ],
        successors: [],
      }],
    }],
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: action => calls.push(action.semanticId),
  });
  const first = await interpreter.run();
  assert.equal(first.status, "yielded");
  assert.deepEqual(first.request, {
    kind: "native-coroutine-continuation",
    semanticId: "native-coroutine-save-continuation",
    callFileOffset: "0x102",
  });
  const second = await interpreter.run(first.state);
  assert.equal(second.status, "completed");
  assert.deepEqual(calls, ["after-continuation"]);
});

test("step limits guard each execution slice without rejecting long resumable events", async () => {
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [
          operation("0x101", "before-continuation"),
          {
            kind: "coroutineContinuationTransfer",
            callFileOffset: "0x102",
            semanticId: "native-coroutine-save-continuation",
          },
          operation("0x104", "after-continuation"),
        ],
        successors: [],
      }],
    }],
  };
  const interpreter = createNativeEventInterpreter({
    program,
    maxSteps: 2,
    executeOperation: () => ({ status: "continued" }),
  });
  const first = await interpreter.run();
  assert.equal(first.status, "yielded");
  assert.equal(first.state.steps, 2);
  const second = await interpreter.run(first.state);
  assert.equal(second.status, "completed");
  assert.equal(second.state.steps, 3);
});

test("propagates operation results through exact native frame fields", async () => {
  const seen = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [
        {
          id: "0x100",
          endFileOffsetExclusive: "0x110",
          actions: [{
            ...operation("0x102", "dialogue-start"),
            resultTarget: {
              kind: "frameField",
              offset: 8,
              storeFileOffset: "0x10a",
            },
          }],
          successors: ["0x110"],
        },
        {
          id: "0x110",
          endFileOffsetExclusive: "0x120",
          actions: [{
            ...operation("0x112", "dialogue-active-query"),
            arguments: [{
              kind: "frame-field",
              offset: 8,
              source: "@(8,r14) at 0x110",
            }],
          }],
          successors: [],
        },
      ],
    }],
  };
  const handle = { channel: 0 };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: (action, context) => {
      if (action.semanticId === "dialogue-start") return { result: handle };
      seen.push(context.readFrameField(action.arguments[0].offset));
      return { result: 1 };
    },
  });
  assert.equal((await interpreter.run()).status, "completed");
  assert.deepEqual(seen, [handle]);
});

test("passes an exact prior operation result into the next operation", async () => {
  const seen = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [
          operation("0x102", "produce-result"),
          {
            ...operation("0x104", "consume-result"),
            arguments: [{
              kind: "operation-result",
              callFileOffset: "0x102",
            }],
          },
        ],
        successors: [],
      }],
    }],
  };
  const execute = createNativeEventOperationExecutor({
    handlers: {
      "produce-result": () => ({ status: "continued", result: 0x40800000 }),
      "consume-result": ({ readArgument }) => {
        seen.push(readArgument(0));
        return { status: "continued" };
      },
    },
  });

  assert.equal((await createNativeEventInterpreter({
    program,
    executeOperation: execute,
  }).run()).status, "completed");
  assert.deepEqual(seen, [0x40800000]);
});

test("truncates operation results to the exact native frame-store width", async () => {
  const seen = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [{
          ...operation("0x102", "free-conversation-read"),
          resultTarget: {
            kind: "frameField",
            offset: 2,
            width: 1,
            storeFileOffset: "0x10a",
          },
        }, {
          ...operation("0x104", "consume-byte"),
          arguments: [{ kind: "frame-field", offset: 2 }],
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: (action, context) => {
      if (action.semanticId === "free-conversation-read") {
        return { result: 0x1234 };
      }
      seen.push(context.readFrameField(2));
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.deepEqual(seen, [0x34]);
});

test("writes operation handles to exact native scene fields", async () => {
  const writes = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        endFileOffsetExclusive: "0x110",
        actions: [{
          ...operation("0x102", "dialogue-start"),
          resultTarget: {
            kind: "sceneField",
            offset: 0x310,
            storeFileOffset: "0x10a",
          },
        }],
        successors: [],
      }],
    }],
  };
  const handle = { channel: 0 };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => ({ result: handle }),
  }).run(null, {
    writeSceneField: write => writes.push(write),
  });
  assert.equal(result.status, "completed");
  assert.equal(writes[0].offset, 0x310);
  assert.equal(writes[0].value, handle);
  assert.equal(writes[0].source.storeFileOffset, "0x10a");
});

test("branches on a proven native operation result comparison", async () => {
  const calls = [];
  const resultComparison = {
    kind: "operationResult",
    comparison: "equal",
    constant: 0,
    compareFileOffset: "0x110",
    resolvedBranch: {
      branchFileOffset: "0x112",
      comparisonTrueSuccessor: "0x120",
      comparisonFalseSuccessor: "0x130",
    },
  };
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [
        {
          id: "0x100",
          endFileOffsetExclusive: "0x108",
          actions: [{
            ...operation("0x102", "dialogue-active-query"),
            resultComparison,
          }],
          successors: ["0x110"],
        },
        {
          id: "0x110",
          endFileOffsetExclusive: "0x114",
          actions: [],
          terminator: { fileOffset: "0x112", mnemonic: "bf" },
          successors: ["0x130", "0x120"],
        },
        {
          id: "0x120",
          endFileOffsetExclusive: "0x128",
          actions: [operation("0x122", "inactive")],
          successors: [],
        },
        {
          id: "0x130",
          endFileOffsetExclusive: "0x138",
          actions: [operation("0x132", "active")],
          successors: [],
        },
      ],
    }],
  };
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation: action => {
      calls.push(action.semanticId);
      return action.semanticId === "dialogue-active-query"
        ? { result: 1 }
        : undefined;
    },
  });
  assert.equal((await interpreter.run()).status, "completed");
  assert.deepEqual(calls, ["dialogue-active-query", "active"]);
});

test("requires independently recovered branch predicates to agree", async () => {
  const branch = {
    branchFileOffset: "0x112",
    comparisonTrueSuccessor: "0x120",
    comparisonFalseSuccessor: "0x130",
  };
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [{
          ...operation("0x102", "native-query"),
          resultTarget: { kind: "frameField", offset: 0, width: 4 },
          resultComparison: {
            kind: "operationResult",
            comparison: "equal",
            constant: 1,
            resolvedBranch: branch,
          },
        }],
        successors: ["0x110"],
      }, {
        id: "0x110",
        actions: [],
        frameFieldComparisons: [{
          fieldOffset: 0,
          loadWidth: 4,
          signedLoad: false,
          comparison: "cmp/eq",
          leftOperand: "r5",
          rightOperand: "r4",
          fieldOperand: "r4",
          constantOperand: "r5",
          constant: 0,
          resolvedBranch: branch,
        }],
        terminator: { fileOffset: "0x112", mnemonic: "bf" },
        successors: ["0x130", "0x120"],
      }, {
        id: "0x120",
        actions: [],
        successors: [],
      }, {
        id: "0x130",
        actions: [],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: () => ({ result: 1 }),
  }).run();
  assert.equal(result.status, "stopped");
  assert.equal(result.reason.kind, "conflicting-branch-predicates");
});

test("branches on an exact stacked operation-result expression", async () => {
  const calls = [];
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [
          operation("0x102", "previous"),
          {
            ...operation("0x104", "current"),
            resultComparison: {
              kind: "operationResultExpression",
              expression: {
                kind: "bitwise-and",
                operands: [{
                  kind: "operation-result",
                  callFileOffset: "0x102",
                }, {
                  kind: "comparison-mask",
                  comparison: "equal",
                  operand: {
                    kind: "operation-result",
                    callFileOffset: "0x104",
                  },
                  constant: 0,
                  trueValue: -1,
                  falseValue: 0,
                }],
              },
              comparison: "equal",
              constant: 0,
              resolvedBranch: {
                branchFileOffset: "0x10a",
                comparisonTrueSuccessor: "0x120",
                comparisonFalseSuccessor: "0x130",
              },
            },
          },
        ],
        successors: ["0x108"],
      }, {
        id: "0x108",
        actions: [],
        terminator: { fileOffset: "0x10a", mnemonic: "bf" },
        successors: ["0x130", "0x120"],
      }, {
        id: "0x120",
        actions: [operation("0x122", "expression-zero")],
        successors: [],
      }, {
        id: "0x130",
        actions: [operation("0x132", "expression-nonzero")],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    executeOperation: action => {
      calls.push(action.semanticId);
      if (action.semanticId === "previous") return { result: 1 };
      if (action.semanticId === "current") return { result: 0 };
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["previous", "current", "expression-nonzero"]);
});

test("branches on an exact scene and direct-call result expression", async () => {
  const calls = [];
  const resultComparison = {
    kind: "callResultExpression",
    expression: {
      kind: "bitwise-and",
      left: {
        kind: "bitwise-and",
        left: {
          kind: "comparison-mask",
          operand: {
            kind: "signed-greater-or-equal",
            left: {
              kind: "scene-field",
              offset: 0xf8,
              width: 4,
              signedLoad: false,
            },
            right: { kind: "constant", value: 400 },
          },
        },
        right: { kind: "call-result", callFileOffset: "0x102" },
      },
      right: { kind: "call-result", callFileOffset: "0x104" },
    },
    comparison: "equal",
    constant: 0,
    resolvedBranch: {
      branchFileOffset: "0x10a",
      comparisonTrueSuccessor: "0x120",
      comparisonFalseSuccessor: "0x130",
    },
  };
  const program = {
    entryFunction: "0x100",
    functions: [{
      id: "0x100",
      entryBlock: "0x100",
      blocks: [{
        id: "0x100",
        actions: [
          operation("0x102", "previous"),
          {
            kind: "directCall",
            callFileOffset: "0x104",
            targetFileOffset: "0x200",
            arguments: [],
            resultComparison,
          },
        ],
        successors: ["0x108"],
      }, {
        id: "0x108",
        actions: [],
        terminator: { fileOffset: "0x10a", mnemonic: "bf" },
        successors: ["0x130", "0x120"],
      }, {
        id: "0x120",
        actions: [operation("0x122", "expression-zero")],
        successors: [],
      }, {
        id: "0x130",
        actions: [operation("0x132", "expression-nonzero")],
        successors: [],
      }],
    }, {
      id: "0x200",
      entryBlock: "0x200",
      returnValue: {
        kind: "frame-field",
        offset: 4,
        width: 4,
        signedLoad: false,
      },
      blocks: [{
        id: "0x200",
        actions: [{
          kind: "frameFieldWrite",
          callFileOffset: "0x202",
          offset: 4,
          width: 4,
          value: 1,
        }],
        successors: [],
      }],
    }],
  };
  const result = await createNativeEventInterpreter({
    program,
    readSceneField: ({ offset }) => offset === 0xf8 ? 450 : undefined,
    executeOperation: action => {
      calls.push(action.semanticId);
      if (action.semanticId === "previous") return { result: -1 };
      return { status: "continued" };
    },
  }).run();
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["previous", "expression-nonzero"]);
});
