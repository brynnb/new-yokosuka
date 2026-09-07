import {
  evaluateNativeFrameFieldComparison,
  evaluateNativeSceneFieldComparison,
} from "./NativeEventPredicate.js";
import {
  createNativeEventArgumentReader,
} from "./NativeEventOperationRuntime.js";
import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";
import { evaluateNativeFrameExpression } from "./NativeFrameExpression.js";

function transformedOperationResult(action, result) {
  const transform = action.resultTransform;
  if (!transform) return { resolved: true, value: result };
  if (
    transform.kind !== "float32-result-truncate-multiply-add"
    || !Number.isInteger(transform.multiplier)
    || !Number.isInteger(transform.addend)
  ) {
    return { resolved: false, reason: "operation-result-transform-unhandled" };
  }
  const source = nativeFloat32FromWord(result);
  if (!Number.isFinite(source)) {
    return { resolved: false, reason: "operation-result-transform-nonfinite" };
  }
  const truncated = Math.trunc(source);
  const multiplied = Math.imul(truncated, transform.multiplier);
  return {
    resolved: true,
    value: ((multiplied >>> 0) + (transform.addend >>> 0)) >>> 0,
  };
}

function childCoroutineTarget(action, operationResults, frameFields) {
  if (action.targetFileOffset) {
    return { resolved: true, targetFileOffset: action.targetFileOffset };
  }
  const source = action.targetSource;
  if (!Array.isArray(action.targetTable)) {
    return { resolved: false, reason: "child-coroutine-target-unresolved" };
  }
  if (source?.kind === "propagated-coroutine-function-pointer") {
    const nativeValue = frameFields?.[source.frameOffset];
    if (!Number.isInteger(nativeValue)) {
      return {
        resolved: false,
        reason: `child-coroutine-target-frame-unavailable:${source.frameOffset}`,
      };
    }
    const entry = action.targetTable.find(item => (
      item.nativeValue === (nativeValue >>> 0)
    ));
    if (
      !entry?.targetFileOffset
      || !action.targetFileOffsets?.includes(entry.targetFileOffset)
    ) {
      return {
        resolved: false,
        reason: `child-coroutine-target-outside-propagated-set:${nativeValue >>> 0}`,
      };
    }
    return { resolved: true, targetFileOffset: entry.targetFileOffset };
  }
  if (source?.kind === "registered-selector-operation-result") {
    const sourceCall = [...(source.callFileOffsets || [])].reverse().find(
      callFileOffset => Number.isInteger(operationResults?.[callFileOffset]),
    );
    if (!sourceCall) {
      return {
        resolved: false,
        reason: "child-coroutine-selector-result-unavailable",
      };
    }
    const selectedIndex = operationResults[sourceCall] >>> 0;
    const entry = action.targetTable.find(item => item.index === selectedIndex);
    if (
      selectedIndex >= source.maximumExclusive
      || !entry?.targetFileOffset
      || !action.targetFileOffsets?.includes(entry.targetFileOffset)
    ) {
      return {
        resolved: false,
        reason: `child-coroutine-target-outside-selector:${selectedIndex}`,
      };
    }
    return { resolved: true, targetFileOffset: entry.targetFileOffset };
  }
  if (source?.kind !== "typed-table-operation-result" || !source.callFileOffset) {
    return { resolved: false, reason: "child-coroutine-target-unresolved" };
  }
  const relativeTarget = operationResults?.[source.callFileOffset];
  if (!Number.isInteger(relativeTarget)) {
    return {
      resolved: false,
      reason: `child-coroutine-target-result-unavailable:${source.callFileOffset}`,
    };
  }
  const entry = action.targetTable.find(item => (
    item.relativeTarget === (relativeTarget >>> 0)
  ));
  if (
    !entry?.targetFileOffset
    || !action.targetFileOffsets?.includes(entry.targetFileOffset)
  ) {
    return {
      resolved: false,
      reason: `child-coroutine-target-outside-table:${relativeTarget >>> 0}`,
    };
  }
  return { resolved: true, targetFileOffset: entry.targetFileOffset };
}

function programIndex(program) {
  if (!program || typeof program !== "object") {
    throw new TypeError("native event program is required");
  }
  if (!Array.isArray(program.functions)) {
    throw new TypeError("native event program functions must be an array");
  }
  const functions = new Map();
  for (const definition of program.functions) {
    if (!definition?.id || functions.has(definition.id)) {
      throw new Error(
        `native event function is missing or duplicated: ${definition?.id}`,
      );
    }
    const blocks = new Map();
    for (const block of definition.blocks || []) {
      if (!block?.id || blocks.has(block.id)) {
        throw new Error(
          `native event block is missing or duplicated: ${block?.id}`,
        );
      }
      blocks.set(block.id, block);
    }
    if (!definition.entryBlock || !blocks.has(definition.entryBlock)) {
      throw new Error(
        `native event function ${definition.id} has no exact entry block`,
      );
    }
    functions.set(definition.id, { definition, blocks });
  }
  return functions;
}

function copyState(state) {
  return {
    steps: state.steps,
    ...(Number.isInteger(state.returnValue)
      ? { returnValue: state.returnValue }
      : {}),
    frames: state.frames.map(frame => ({
      ...frame,
      fields: { ...(frame.fields || {}) },
      operationResults: { ...(frame.operationResults || {}) },
      pendingOperationComparison: frame.pendingOperationComparison
        ? { ...frame.pendingOperationComparison }
        : null,
      pendingRuntimeContinuation: frame.pendingRuntimeContinuation
        ? { ...frame.pendingRuntimeContinuation }
        : null,
    })),
  };
}

function location(state) {
  const frame = state.frames.at(-1);
  return frame
    ? {
        functionId: frame.functionId,
        blockId: frame.blockId,
        actionIndex: frame.actionIndex,
        callDepth: state.frames.length,
      }
    : null;
}

function stopped(state, kind, detail = {}) {
  return {
    status: "stopped",
    reason: { kind, ...detail },
    location: location(state),
    state: copyState(state),
  };
}

function operationResultExpression(expression, results, readSceneField) {
  if (["operation-result", "call-result"].includes(expression?.kind)) {
    const value = results?.[expression.callFileOffset];
    return Number.isInteger(value)
      ? { resolved: true, value }
      : {
          resolved: false,
          reason: `operation-result-unavailable:${expression.callFileOffset}`,
        };
  }
  if (expression?.kind === "constant" && Number.isInteger(expression.value)) {
    return { resolved: true, value: expression.value >>> 0 };
  }
  if (
    expression?.kind === "scene-field"
    && [1, 2, 4].includes(expression.width)
    && Number.isInteger(expression.offset)
    && typeof readSceneField === "function"
  ) {
    const value = readSceneField({
      offset: expression.offset,
      width: expression.width,
      signedLoad: Boolean(expression.signedLoad),
    });
    return Number.isInteger(value)
      ? { resolved: true, value }
      : {
          resolved: false,
          reason: `call-result-expression-scene-field:${expression.offset}`,
        };
  }
  if ([
    "equal",
    "signed-greater-than",
    "signed-greater-or-equal",
    "unsigned-greater-than",
    "unsigned-greater-or-equal",
  ].includes(expression?.kind)) {
    const left = operationResultExpression(
      expression.left,
      results,
      readSceneField,
    );
    if (!left.resolved) return left;
    const right = operationResultExpression(
      expression.right,
      results,
      readSceneField,
    );
    if (!right.resolved) return right;
    const matched = {
      equal: () => left.value === right.value,
      "signed-greater-than": () => (left.value | 0) > (right.value | 0),
      "signed-greater-or-equal": () => (
        (left.value | 0) >= (right.value | 0)
      ),
      "unsigned-greater-than": () => (
        (left.value >>> 0) > (right.value >>> 0)
      ),
      "unsigned-greater-or-equal": () => (
        (left.value >>> 0) >= (right.value >>> 0)
      ),
    }[expression.kind]();
    return { resolved: true, value: matched ? 1 : 0 };
  }
  if (expression?.kind === "comparison-mask") {
    const operand = operationResultExpression(
      expression.operand,
      results,
      readSceneField,
    );
    if (!operand.resolved) return operand;
    if (!Object.hasOwn(expression, "comparison")) {
      return { resolved: true, value: operand.value ? -1 : 0 };
    }
    if (expression.comparison !== "equal") {
      return {
        resolved: false,
        reason: `operation-result-expression-comparison:${expression.comparison}`,
      };
    }
    return {
      resolved: true,
      value: operand.value === expression.constant
        ? expression.trueValue
        : expression.falseValue,
    };
  }
  if (
    expression?.kind === "bitwise-and"
    && Array.isArray(expression.operands)
    && expression.operands.length >= 2
  ) {
    let value;
    for (const item of expression.operands) {
      const operand = operationResultExpression(item, results, readSceneField);
      if (!operand.resolved) return operand;
      value = value === undefined
        ? operand.value
        : value & operand.value;
    }
    return { resolved: true, value };
  }
  if (
    ["bitwise-and", "bitwise-or"].includes(expression?.kind)
    && expression.left
    && expression.right
  ) {
    const left = operationResultExpression(
      expression.left,
      results,
      readSceneField,
    );
    if (!left.resolved) return left;
    const right = operationResultExpression(
      expression.right,
      results,
      readSceneField,
    );
    if (!right.resolved) return right;
    return {
      resolved: true,
      value: expression.kind === "bitwise-and"
        ? left.value & right.value
        : left.value | right.value,
    };
  }
  return {
    resolved: false,
    reason: `operation-result-expression-unhandled:${expression?.kind}`,
  };
}

function frameFieldExpression(expression, fields) {
  return evaluateNativeFrameExpression(expression, offset => fields?.[offset]);
}

function yielded(state, request) {
  return {
    status: "yielded",
    request,
    location: location(state),
    state: copyState(state),
  };
}

function completed(state) {
  return {
    status: "completed",
    steps: state.steps,
    ...(Number.isInteger(state.returnValue)
      ? { returnValue: state.returnValue }
      : {}),
    state: copyState(state),
  };
}

function nativeFrameReturnValue(definition, fields) {
  if (!["frame-field", "frame-field-mask"].includes(definition?.kind)) {
    return null;
  }
  const field = fields?.[definition.offset];
  if (!Number.isInteger(field)) return null;
  if (definition.kind === "frame-field-mask") {
    return (field >>> 0) & (definition.mask >>> 0);
  }
  const widthMask = definition.width === 4
    ? 0xffffffff
    : (2 ** (definition.width * 8)) - 1;
  let value = (field >>> 0) & widthMask;
  if (definition.signedLoad && definition.width < 4) {
    const signBit = 2 ** ((definition.width * 8) - 1);
    if (value & signBit) value = (value | (~widthMask)) >>> 0;
  }
  return value;
}

function directCallFields(action, caller, callerDefinition, calleeDefinition) {
  const fields = {};
  const base = calleeDefinition.frameArgumentBase;
  if (!Number.isInteger(base)) return fields;
  for (const [index, argument] of (action.arguments || []).entries()) {
    let value;
    if (["constant", "static-pointer", "function-pointer"].includes(argument.kind)) {
      value = argument.value;
    } else if (argument.kind === "frame-field") {
      value = caller.fields?.[argument.offset];
    } else if (argument.kind === "caller-argument") {
      const callerOffset = Number.isInteger(argument.frameOffset)
        ? argument.frameOffset
        : Number.isInteger(callerDefinition.frameArgumentBase)
          ? callerDefinition.frameArgumentBase + (argument.index * 4)
          : null;
      if (Number.isInteger(callerOffset)) {
        value = caller.fields?.[callerOffset];
      }
    }
    if (Number.isInteger(value)) {
      fields[base + (index * 4)] = value >>> 0;
    }
  }
  return fields;
}

function transferInBlock(definition, block) {
  const start = Number.parseInt(block.id, 0);
  const end = Number.parseInt(block.endFileOffsetExclusive, 0);
  return (definition.unresolvedControlTransfers || []).find((transfer) => {
    const offset = Number.parseInt(transfer.fileOffset, 0);
    return offset >= start && offset < end;
  });
}

function branchComparison(block) {
  const branchOffset = block.terminator?.fileOffset;
  if (!branchOffset) return [];
  return (block.sceneFieldComparisons || []).filter(
    comparison => (
      comparison.resolvedBranch?.branchFileOffset === branchOffset
    ),
  );
}

function frameBranchComparison(block) {
  const branchOffset = block.terminator?.fileOffset;
  if (!branchOffset) return [];
  return (block.frameFieldComparisons || []).filter(
    comparison => (
      comparison.resolvedBranch?.branchFileOffset === branchOffset
    ),
  );
}

export class NativeEventInterpreter {
  constructor({
    program,
    executeOperation,
    executeRuntimeInterface,
    launchCoroutine,
    readSceneField,
    maxSteps = 10000,
  }) {
    if (typeof executeOperation !== "function") {
      throw new TypeError("native operation executor is required");
    }
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
      throw new RangeError("native event step limit must be positive");
    }
    this.program = program;
    this.functions = programIndex(program);
    this.executeOperation = executeOperation;
    this.executeRuntimeInterface = executeRuntimeInterface;
    this.launchCoroutine = launchCoroutine;
    this.readSceneField = readSceneField;
    this.maxSteps = maxSteps;
  }

  initialState(
    entryFunction = this.program.entryFunction,
    initialFrameFields = {},
  ) {
    const target = this.functions.get(entryFunction);
    if (!target) {
      throw new Error(`native event entry function is absent: ${entryFunction}`);
    }
    return {
      steps: 0,
      frames: [{
        functionId: entryFunction,
        blockId: target.definition.entryBlock,
        actionIndex: 0,
        fields: { ...initialFrameFields },
        operationResults: {},
        pendingOperationComparison: null,
        pendingRuntimeContinuation: null,
        callerResultTarget: null,
      }],
    };
  }

  async run(inputState = null, context = {}) {
    const state = inputState
      ? copyState(inputState)
      : this.initialState(
          context.entryFunction,
          context.initialFrameFields,
        );
    const sliceStartSteps = state.steps;

    while (state.frames.length) {
      if (state.steps - sliceStartSteps >= this.maxSteps) {
        return stopped(state, "step-limit", { limit: this.maxSteps });
      }
      const frame = state.frames.at(-1);
      const target = this.functions.get(frame.functionId);
      const block = target?.blocks.get(frame.blockId);
      if (!target || !block) {
        return stopped(state, "program-location-missing");
      }
      const actions = block.actions || [];
      if (frame.actionIndex < actions.length) {
        const action = actions[frame.actionIndex];
        state.steps += 1;
        if (action.kind === "engineOperation") {
          if (action.adapterStatus !== "proven" || !action.semanticId) {
            return stopped(state, "unresolved-operation", {
              operationHex: action.operationHex,
              callFileOffset: action.callFileOffset,
              knownOperationFamilies: (
                action.knownOperationFamilies
                || (
                  action.knownOperationFamily
                    ? [action.knownOperationFamily]
                    : []
                )
              ),
            });
          }
          const result = await this.executeOperation(action, {
            ...context,
            location: location(state),
            functionDefinition: target.definition,
            readFrameField: offset => frame.fields?.[offset],
            readOperationResult: callFileOffset => (
              frame.operationResults?.[callFileOffset]
            ),
            writeFrameField: write => {
              frame.fields[write.offset] = write.value;
            },
            readSceneField: descriptor => context.readSceneField?.(
              Number.isInteger(descriptor)
                ? {
                    offset: descriptor,
                    width: 4,
                    signedLoad: false,
                  }
                : descriptor,
            ),
          });
          if (result?.status === "stopped") {
            return stopped(state, "operation-stopped", {
              semanticId: action.semanticId,
              detail: result.reason,
            });
          }
          if (Object.hasOwn(result || {}, "result")) {
            frame.operationResults[action.callFileOffset] = result.result;
            const transformed = transformedOperationResult(
              action,
              result.result,
            );
            if (!transformed.resolved) {
              return stopped(state, transformed.reason, {
                semanticId: action.semanticId,
                callFileOffset: action.callFileOffset,
              });
            }
            const resultTarget = (
              action.resultTransform?.resultTarget
              || action.resultTarget
            );
            if (resultTarget?.kind === "frameField") {
              const width = resultTarget.width ?? 4;
              const mask = width === 4
                ? 0xffffffff
                : (2 ** (width * 8)) - 1;
              frame.fields[resultTarget.offset] = (
                typeof transformed.value === "number"
                  ? (transformed.value >>> 0) & mask
                  : transformed.value
              );
            } else if (resultTarget?.kind === "sceneField") {
              if (typeof context.writeSceneField !== "function") {
                return stopped(state, "scene-field-writer-missing", {
                  offset: resultTarget.offset,
                });
              }
              context.writeSceneField({
                offset: resultTarget.offset,
                width: resultTarget.width ?? 4,
                value: transformed.value,
                source: {
                  functionFileOffset: frame.functionId,
                  callFileOffset: action.callFileOffset,
                  storeFileOffset: resultTarget.storeFileOffset,
                },
              });
            }
            if (action.resultComparison) {
              frame.pendingOperationComparison = {
                definition: action.resultComparison,
                result: result.result,
              };
            }
          } else if (action.resultComparison) {
            return stopped(state, "operation-result-missing", {
              semanticId: action.semanticId,
              callFileOffset: action.callFileOffset,
            });
          }
          frame.actionIndex += 1;
          if (result?.status === "yielded") {
            return yielded(state, result.request);
          }
          continue;
        }
        if (action.kind === "secondaryEngineOperation") {
          if (action.adapterStatus !== "proven" || !action.semanticId) {
            return stopped(state, "unresolved-secondary-operation", {
              operationHex: action.operationHex,
              callFileOffset: action.callFileOffset,
              dispatcher: action.dispatcher,
            });
          }
          const result = await this.executeOperation(action, {
            ...context,
            location: location(state),
            functionDefinition: target.definition,
            readFrameField: offset => frame.fields?.[offset],
            writeFrameField: write => {
              frame.fields[write.offset] = write.value;
            },
            readSceneField: offset => context.readSceneField?.({
              offset,
              width: 4,
              signedLoad: false,
            }),
          });
          if (result?.status === "stopped") {
            return stopped(state, "operation-stopped", {
              semanticId: action.semanticId,
              detail: result.reason,
            });
          }
          frame.actionIndex += 1;
          if (result?.status === "yielded") {
            return yielded(state, result.request);
          }
          continue;
        }
        if (action.kind === "directCall") {
          const callee = this.functions.get(action.targetFileOffset);
          if (!callee) {
            return stopped(state, "unresolved-direct-call", {
              callFileOffset: action.callFileOffset,
              targetFileOffset: action.targetFileOffset,
            });
          }
          frame.actionIndex += 1;
          state.frames.push({
            functionId: action.targetFileOffset,
            blockId: callee.definition.entryBlock,
            actionIndex: 0,
            fields: directCallFields(
              action,
              frame,
              target.definition,
              callee.definition,
            ),
            operationResults: {},
            pendingOperationComparison: null,
            pendingRuntimeContinuation: null,
            callerResultTarget: action.resultTarget || null,
            callerResultComparison: action.resultComparison || null,
            callerResultCallFileOffset: action.callFileOffset,
          });
          continue;
        }
        if (action.kind === "childCoroutineLaunch") {
          const target = childCoroutineTarget(
            action,
            frame.operationResults,
            frame.fields,
          );
          if (!target.resolved) {
            return stopped(state, target.reason, {
              callFileOffset: action.callFileOffset,
              targetSource: action.targetSource ?? null,
            });
          }
          const resolvedAction = {
            ...action,
            targetFileOffset: target.targetFileOffset,
          };
          if (typeof this.launchCoroutine !== "function") {
            return stopped(state, "child-coroutine-launch-unhandled", {
              callFileOffset: action.callFileOffset,
              targetFileOffset: target.targetFileOffset,
            });
          }
          const result = await this.launchCoroutine(resolvedAction, {
            ...context,
            location: location(state),
            readArgument: createNativeEventArgumentReader(
              action,
              {
                ...context,
                readFrameField: offset => frame.fields?.[offset],
                readSceneField: offset => context.readSceneField?.({
                  offset,
                  width: 4,
                  signedLoad: false,
                }),
              },
              context.resolveOperand,
            ),
          });
          if (result?.status !== "launched") {
            return stopped(state, "child-coroutine-launch-rejected", {
              callFileOffset: action.callFileOffset,
              targetFileOffset: target.targetFileOffset,
              detail: result?.reason,
            });
          }
          if (action.resultTarget?.kind === "frameField") {
            if (!Number.isInteger(result.handle)) {
              return stopped(state, "child-coroutine-handle-missing", {
                callFileOffset: action.callFileOffset,
                targetFileOffset: target.targetFileOffset,
              });
            }
            const width = action.resultTarget.width ?? 4;
            const mask = width === 4
              ? 0xffffffff
              : (2 ** (width * 8)) - 1;
            frame.fields[action.resultTarget.offset] = (
              result.handle >>> 0
            ) & mask;
          }
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "frameFieldAdd") {
          const value = frame.fields?.[action.offset];
          if (!Number.isInteger(value) || action.width !== 4) {
            return stopped(state, "frame-field-mutation-input-missing", {
              offset: action.offset,
              width: action.width,
              callFileOffset: action.callFileOffset,
            });
          }
          frame.fields[action.offset] = (
            (value >>> 0) + (action.value | 0)
          ) >>> 0;
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "frameFieldWrite") {
          if (
            ![1, 2, 4].includes(action.width)
            || !Number.isInteger(action.offset)
            || !Number.isInteger(action.value)
          ) {
            return stopped(state, "frame-field-write-invalid", {
              callFileOffset: action.callFileOffset,
            });
          }
          const mask = action.width === 4
            ? 0xffffffff
            : (2 ** (action.width * 8)) - 1;
          frame.fields[action.offset] = (action.value >>> 0) & mask;
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "frameFieldExpressionWrite") {
          if (
            ![1, 2, 4].includes(action.width)
            || !Number.isInteger(action.offset)
          ) {
            return stopped(state, "frame-field-expression-write-invalid", {
              callFileOffset: action.callFileOffset,
            });
          }
          const evaluated = frameFieldExpression(
            action.expression,
            frame.fields,
          );
          if (!evaluated.resolved) {
            return stopped(state, "frame-field-expression-input-missing", {
              callFileOffset: action.callFileOffset,
              detail: evaluated.reason,
            });
          }
          const mask = action.width === 4
            ? 0xffffffff
            : (2 ** (action.width * 8)) - 1;
          frame.fields[action.offset] = (evaluated.value >>> 0) & mask;
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "sceneFieldWrite") {
          if (
            ![1, 2, 4].includes(action.width)
            || !Number.isInteger(action.offset)
            || !Number.isInteger(action.value)
            || typeof context.writeSceneField !== "function"
          ) {
            return stopped(state, "scene-field-write-invalid", {
              callFileOffset: action.callFileOffset,
            });
          }
          const mask = action.width === 4
            ? 0xffffffff
            : (2 ** (action.width * 8)) - 1;
          context.writeSceneField({
            offset: action.offset,
            width: action.width,
            value: (action.value >>> 0) & mask,
            source: {
              functionFileOffset: frame.functionId,
              callFileOffset: action.callFileOffset,
            },
          });
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "sceneFieldBitwiseWrite") {
          if (
            ![1, 2, 4].includes(action.width)
            || !Number.isInteger(action.offset)
            || action.operator !== "or"
            || !Number.isInteger(action.mask)
            || typeof context.readSceneField !== "function"
            || typeof context.writeSceneField !== "function"
          ) {
            return stopped(state, "scene-field-bitwise-write-invalid", {
              callFileOffset: action.callFileOffset,
            });
          }
          const previous = context.readSceneField({
            offset: action.offset,
            width: action.width,
            signedLoad: action.width !== 4,
          });
          if (!Number.isInteger(previous)) {
            return stopped(state, "scene-field-bitwise-source-missing", {
              callFileOffset: action.callFileOffset,
              sceneOffset: action.offset,
            });
          }
          const mask = action.width === 4
            ? 0xffffffff
            : (2 ** (action.width * 8)) - 1;
          context.writeSceneField({
            offset: action.offset,
            width: action.width,
            value: ((previous >>> 0) | (action.mask >>> 0)) & mask,
            source: {
              functionFileOffset: frame.functionId,
              callFileOffset: action.callFileOffset,
            },
          });
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "frameFieldSceneWrite") {
          if (
            action.width !== 4
            || !Number.isInteger(action.offset)
            || !Number.isInteger(action.sceneOffset)
            || ![1, 2, 4].includes(action.sceneWidth ?? 4)
            || typeof context.readSceneField !== "function"
          ) {
            return stopped(state, "frame-field-scene-write-invalid", {
              callFileOffset: action.callFileOffset,
            });
          }
          const source = context.readSceneField({
            offset: action.sceneOffset,
            width: action.sceneWidth ?? 4,
            signedLoad: action.signedLoad === true,
          });
          if (!Number.isInteger(source)) {
            return stopped(state, "frame-field-scene-source-missing", {
              callFileOffset: action.callFileOffset,
              sceneOffset: action.sceneOffset,
            });
          }
          let value = source >>> 0;
          if (Number.isInteger(action.floatAddendWord)) {
            value = nativeFloat32Word(
              Math.fround(
                nativeFloat32FromWord(value)
                + nativeFloat32FromWord(action.floatAddendWord),
              ),
            );
          }
          frame.fields[action.offset] = value;
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "indirectCall") {
          return stopped(state, "unresolved-indirect-call", {
            callFileOffset: action.callFileOffset,
            operands: action.operands,
            targetSource: action.targetSource ?? null,
          });
        }
        if (action.kind === "runtimeInterfaceCall") {
          if (
            action.behaviorStatus !== "proven"
            || !action.semanticId
            || typeof this.executeRuntimeInterface !== "function"
          ) {
            return stopped(state, "runtime-interface-call-unhandled", {
              callFileOffset: action.callFileOffset,
              runtimeCallKind: action.runtimeCallKind,
              behaviorStatus: action.behaviorStatus,
              targetSource: action.targetSource,
            });
          }
          const result = await this.executeRuntimeInterface(action, {
            ...context,
            location: location(state),
            functionDefinition: target.definition,
            readFrameField: offset => frame.fields?.[offset],
            readOperationResult: callFileOffset => (
              frame.operationResults?.[callFileOffset]
            ),
            readSceneField: descriptor => context.readSceneField?.(
              Number.isInteger(descriptor)
                ? { offset: descriptor, width: 4, signedLoad: false }
                : descriptor,
            ),
          });
          if (result?.status === "stopped") {
            return stopped(state, "runtime-interface-call-stopped", {
              semanticId: action.semanticId,
              callFileOffset: action.callFileOffset,
              detail: result.reason,
            });
          }
          if (!Object.hasOwn(result || {}, "result")) {
            return stopped(state, "runtime-interface-result-missing", {
              semanticId: action.semanticId,
              callFileOffset: action.callFileOffset,
            });
          }
          frame.operationResults[action.callFileOffset] = result.result;
          if (action.resultBitTest) {
            frame.pendingOperationComparison = {
              definition: action.resultBitTest,
              result: result.result,
            };
          }
          frame.pendingRuntimeContinuation = result.continuation || null;
          frame.actionIndex += 1;
          continue;
        }
        if (action.kind === "coroutineContinuationTransfer") {
          frame.actionIndex += 1;
          const scheduler = frame.pendingRuntimeContinuation;
          frame.pendingRuntimeContinuation = null;
          return yielded(state, {
            kind: "native-coroutine-continuation",
            semanticId: action.semanticId,
            callFileOffset: action.callFileOffset,
            ...(scheduler ? { scheduler } : {}),
          });
        }
        return stopped(state, "unsupported-action", { actionKind: action.kind });
      }

      const successors = block.successors || [];
      if (successors.length === 1) {
        frame.blockId = successors[0];
        frame.actionIndex = 0;
        state.steps += 1;
        continue;
      }
      if (successors.length === 2) {
        const comparisons = branchComparison(block);
        const frameComparisons = frameBranchComparison(block);
        const pending = frame.pendingOperationComparison;
        const pendingBranch = pending?.definition?.resolvedBranch;
        const usesPending = (
          pendingBranch?.branchFileOffset === block.terminator?.fileOffset
        );
        const exactPredicateCount = comparisons.length
          + frameComparisons.length
          + (usesPending ? 1 : 0);
        if (exactPredicateCount === 0) {
          return stopped(state, "unresolved-branch-predicate", {
            branchFileOffset: block.terminator?.fileOffset,
            candidateCount: exactPredicateCount,
          });
        }
        const resolvedSuccessors = [];
        for (const comparison of comparisons) {
          const result = evaluateNativeSceneFieldComparison(
            comparison,
            { readSceneField: context.readSceneField || this.readSceneField },
          );
          if (!result.resolved) {
            return stopped(state, "unresolved-branch-predicate", {
              branchFileOffset: block.terminator?.fileOffset,
              detail: result.reason,
            });
          }
          resolvedSuccessors.push(result.successor);
        }
        for (const comparison of frameComparisons) {
          const result = evaluateNativeFrameFieldComparison(
            comparison,
            { readFrameField: offset => frame.fields?.[offset] },
          );
          if (!result.resolved) {
            return stopped(state, "unresolved-branch-predicate", {
              branchFileOffset: block.terminator?.fileOffset,
              detail: result.reason,
            });
          }
          resolvedSuccessors.push(result.successor);
        }
        if (usesPending) {
          const definition = pending.definition;
          if (
            definition.comparison !== "equal"
            && definition.kind !== "runtimeResultBit"
          ) {
            return stopped(state, "unresolved-branch-predicate", {
              branchFileOffset: block.terminator?.fileOffset,
              detail: (
                `operation-result-comparison:${definition.comparison}`
              ),
            });
          }
          let comparisonMatched;
          if (definition.kind === "runtimeResultBit") {
            comparisonMatched = (
              ((pending.result >>> 0) & (definition.mask >>> 0)) !== 0
            );
          } else if ([
            "operationResultExpression",
            "callResultExpression",
          ].includes(definition.kind)) {
            const evaluated = operationResultExpression(
              definition.expression,
              frame.operationResults,
              context.readSceneField || this.readSceneField,
            );
            if (!evaluated.resolved) {
              return stopped(state, "unresolved-branch-predicate", {
                branchFileOffset: block.terminator?.fileOffset,
                detail: evaluated.reason,
              });
            }
            comparisonMatched = evaluated.value === definition.constant;
          } else {
            comparisonMatched = pending.result === definition.constant;
          }
          resolvedSuccessors.push(comparisonMatched
            ? pendingBranch.comparisonTrueSuccessor
            : pendingBranch.comparisonFalseSuccessor);
          frame.pendingOperationComparison = null;
        }
        const uniqueSuccessors = new Set(resolvedSuccessors);
        if (uniqueSuccessors.size !== 1) {
          return stopped(state, "conflicting-branch-predicates", {
            branchFileOffset: block.terminator?.fileOffset,
            candidates: resolvedSuccessors,
          });
        }
        const successor = resolvedSuccessors[0];
        if (!successors.includes(successor)) {
          return stopped(state, "invalid-branch-successor", {
            successor,
          });
        }
        frame.blockId = successor;
        frame.actionIndex = 0;
        state.steps += 1;
        continue;
      }
      if (successors.length > 2) {
        return stopped(state, "unsupported-successor-count", {
          count: successors.length,
        });
      }
      const transfer = transferInBlock(target.definition, block);
      if (transfer) {
        return stopped(state, "unresolved-control-transfer", { transfer });
      }
      const finished = state.frames.pop();
      if (finished.callerResultTarget || finished.callerResultComparison) {
        const definition = target.definition.returnValue;
        if (!["frame-field", "frame-field-mask"].includes(definition?.kind)) {
          return stopped(state, "direct-call-result-unresolved", {
            functionId: finished.functionId,
          });
        }
        const value = nativeFrameReturnValue(definition, finished.fields);
        if (!Number.isInteger(value)) {
          return stopped(state, "direct-call-return-field-missing", {
            functionId: finished.functionId,
            offset: definition.offset,
          });
        }
        const caller = state.frames.at(-1);
        if (!caller) {
          return stopped(state, "direct-call-result-caller-missing");
        }
        if (finished.callerResultTarget?.kind === "frameField") {
          caller.fields[finished.callerResultTarget.offset] = value;
        } else if (finished.callerResultTarget?.kind === "sceneField") {
          if (typeof context.writeSceneField !== "function") {
            return stopped(state, "scene-field-writer-missing", {
              offset: finished.callerResultTarget.offset,
            });
          }
          context.writeSceneField({
            offset: finished.callerResultTarget.offset,
            width: 4,
            value,
          });
        } else if (finished.callerResultTarget) {
          return stopped(state, "direct-call-result-target-unresolved");
        }
        if (finished.callerResultComparison) {
          caller.operationResults[finished.callerResultCallFileOffset] = value;
          caller.pendingOperationComparison = {
            definition: finished.callerResultComparison,
            result: value,
          };
        }
      }
      if (state.frames.length === 0 && target.definition.returnValue) {
        const value = nativeFrameReturnValue(
          target.definition.returnValue,
          finished.fields,
        );
        if (!Number.isInteger(value)) {
          return stopped(state, "root-return-field-missing", {
            functionId: finished.functionId,
            offset: target.definition.returnValue.offset,
          });
        }
        state.returnValue = value;
      }
    }
    return completed(state);
  }
}

export function createNativeEventInterpreter(options) {
  return new NativeEventInterpreter(options);
}
