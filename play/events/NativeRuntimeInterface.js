import { exactNativeIntegerValue } from "./NativeIntegerExpression.js";

function exactSchedulerArgument(action, index, context) {
  const dispatch = action.runtimeDispatch;
  const argument = dispatch?.arguments?.[index];
  if (dispatch?.argumentCount !== dispatch?.arguments?.length) return null;
  if (argument?.kind === "constant" && Number.isInteger(argument.value)) {
    return argument.value >>> 0;
  }
  if (
    argument?.kind === "frame-field"
    && argument.width === 4
    && argument.signedLoad === false
    && Number.isInteger(argument.offset)
  ) {
    const value = context.readFrameField?.(argument.offset);
    return Number.isInteger(value) ? value >>> 0 : null;
  }
  if (
    argument?.kind === "operation-result"
    && typeof argument.callFileOffset === "string"
  ) {
    const value = context.readOperationResult?.(argument.callFileOffset);
    return Number.isInteger(value) ? value >>> 0 : null;
  }
  return null;
}

function exactArithmeticArgument(action, index, context) {
  if (
    action.integerArithmetic?.argumentCount !== 2
    || action.integerArithmetic?.arguments?.length !== 2
  ) return null;
  return exactNativeIntegerValue(
    action.integerArithmetic.arguments[index],
    context,
  );
}

export function createNativeRuntimeInterfaceExecutor({
  querySchedulerGlobalReadiness,
} = {}) {
  return async function executeNativeRuntimeInterface(action, context = {}) {
    if ([
      "native-signed-integer-division",
      "native-signed-integer-remainder",
    ].includes(action.semanticId)) {
      const dividend = exactArithmeticArgument(action, 0, context);
      const divisor = exactArithmeticArgument(action, 1, context);
      if (
        dividend === null
        || divisor === null
        || divisor === 0
        || divisor === -1
      ) {
        return {
          status: "stopped",
          reason: "signed-integer-arithmetic-abi-mismatch",
        };
      }
      const result = action.semanticId === "native-signed-integer-division"
        ? Math.trunc(dividend / divisor)
        : dividend % divisor;
      return { status: "continued", result: result >>> 0 };
    }
    if (action.semanticId === "native-scheduler-global-readiness") {
      if (
        action.runtimeDispatch?.selector !== 19
        || action.runtimeDispatch?.argumentCount !== 0
        || action.runtimeDispatch?.arguments?.length !== 0
        || action.resultBitTest?.mask !== 0x00010000
      ) {
        return {
          status: "stopped",
          reason: "scheduler-global-readiness-abi-mismatch",
        };
      }
      const query = querySchedulerGlobalReadiness
        || context.queryNativeSchedulerGlobalReadiness;
      if (typeof query !== "function") {
        return {
          status: "stopped",
          reason: "scheduler-global-readiness-query-missing",
        };
      }
      const ready = await query({
        selector: 19,
        callFileOffset: action.callFileOffset,
        functionFileOffset: context.location?.functionId,
      });
      if (typeof ready !== "boolean") {
        return {
          status: "stopped",
          reason: "scheduler-global-readiness-result-invalid",
        };
      }
      return {
        status: "continued",
        result: ready ? 0x00010000 : 0,
        continuation: ready ? null : {
          kind: "native-scheduler-global-readiness",
          ticks: 1,
          selector: 19,
          callFileOffset: action.callFileOffset,
          functionFileOffset: context.location?.functionId,
        },
      };
    }
    if (action.semanticId !== "native-scheduler-countdown") {
      return {
        status: "stopped",
        reason: "runtime-interface-semantic-unhandled",
      };
    }
    const countdown = exactSchedulerArgument(action, 0, context);
    if (
      action.runtimeDispatch?.selector !== 0
      || action.resultBitTest?.mask !== 0x00010000
      || countdown === null
    ) {
      return {
        status: "stopped",
        reason: "scheduler-countdown-abi-mismatch",
      };
    }
    return {
      status: "continued",
      // Native selector 0 tests the original word, decrements it in-place,
      // and exposes readiness through result bit 16.
      result: countdown === 0 ? 0x00010000 : 0,
      continuation: countdown === 0
        ? null
        : {
            kind: "native-scheduler-countdown",
            ticks: countdown,
            selector: 0,
            callFileOffset: action.callFileOffset,
            functionFileOffset: context.location?.functionId,
          },
    };
  };
}
