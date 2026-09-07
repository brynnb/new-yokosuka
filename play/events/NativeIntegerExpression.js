import { evaluateNativeFrameExpression } from "./NativeFrameExpression.js";

export function exactNativeFrameOffset(argument, context = {}, depth = 0) {
  if (depth > 12) return null;
  if (
    !["frame-address-expression", "frame-field-expression"].includes(
      argument?.kind,
    )
    || !Number.isInteger(argument.baseOffset)
    || argument.baseOffset < 0
  ) return null;
  const dynamicOffset = exactNativeIntegerValue(
    argument.offsetExpression,
    context,
    depth + 1,
  );
  return dynamicOffset === null
    ? null
    : (argument.baseOffset + dynamicOffset) >>> 0;
}

export function exactNativeIntegerValue(argument, context = {}, depth = 0) {
  if (depth > 12) return null;
  if (argument?.kind === "constant" && Number.isInteger(argument.value)) {
    return argument.value | 0;
  }
  if (argument?.kind === "float32-truncate-to-signed-integer") {
    const result = evaluateNativeFrameExpression(
      argument,
      context.readFrameField,
      depth + 1,
    );
    return result.resolved ? result.value | 0 : null;
  }
  if (
    argument?.kind === "frame-field-expression"
    && argument.width === 4
    && argument.signedLoad === false
  ) {
    const offset = exactNativeFrameOffset(argument, context, depth + 1);
    if (offset === null) return null;
    const value = context.readFrameField?.(offset);
    return Number.isInteger(value) ? value | 0 : null;
  }
  if (
    argument?.kind === "frame-field"
    && [1, 2, 4].includes(argument.width)
    && typeof argument.signedLoad === "boolean"
    && Number.isInteger(argument.offset)
  ) {
    const value = context.readFrameField?.(argument.offset);
    return Number.isInteger(value)
      ? normalizeNativeIntegerLoad(value, argument.width, argument.signedLoad)
      : null;
  }
  if (
    argument?.kind === "scene-field"
    && [1, 2, 4].includes(argument.width)
    && typeof argument.signedLoad === "boolean"
    && Number.isInteger(argument.offset)
  ) {
    const value = context.readSceneField?.({
      offset: argument.offset,
      width: argument.width,
      signedLoad: argument.signedLoad,
    });
    return Number.isInteger(value) ? value | 0 : null;
  }
  if (
    argument?.kind !== "integer-expression"
    || ![
      "add", "subtract", "multiply-low",
      "signed-binary-angle-difference",
    ].includes(argument.operator)
  ) return null;

  const left = exactNativeIntegerValue(argument.left, context, depth + 1);
  const right = exactNativeIntegerValue(argument.right, context, depth + 1);
  if (left === null || right === null) return null;
  if (argument.operator === "add") return (left + right) | 0;
  if (argument.operator === "subtract") return (left - right) | 0;
  if (argument.operator === "signed-binary-angle-difference") {
    const difference = (right - left) & 0xffff;
    return difference > 0x8000 ? difference - 0x10000 : difference;
  }
  return Math.imul(left, right);
}

function normalizeNativeIntegerLoad(value, width, signedLoad) {
  if (width === 4) return value | 0;
  const bits = width * 8;
  const mask = (2 ** bits) - 1;
  const narrowed = value & mask;
  if (!signedLoad) return narrowed;
  const sign = 2 ** (bits - 1);
  return narrowed >= sign ? narrowed - (2 ** bits) : narrowed;
}
