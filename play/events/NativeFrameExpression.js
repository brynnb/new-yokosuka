import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

export function evaluateNativeFrameExpression(
  expression,
  readFrameField,
  depth = 0,
) {
  if (depth > 20) return { resolved: false, reason: "frame-expression-depth" };
  const evaluate = operand => evaluateNativeFrameExpression(
    operand, readFrameField, depth + 1,
  );
  if (expression?.kind === "constant" && Number.isInteger(expression.value)) {
    return { resolved: true, value: expression.value >>> 0 };
  }
  if (
    expression?.kind === "frame-field"
    && [1, 2, 4].includes(expression.width)
    && Number.isInteger(expression.offset)
  ) {
    const stored = readFrameField?.(expression.offset);
    if (!Number.isInteger(stored)) return {
      resolved: false,
      reason: `frame-field-expression-source-missing:${expression.offset}`,
    };
    const bits = expression.width * 8;
    const mask = expression.width === 4 ? 0xffffffff : (2 ** bits) - 1;
    let value = (stored >>> 0) & mask;
    if (expression.signedLoad && expression.width !== 4) {
      const sign = 2 ** (bits - 1);
      if (value & sign) value -= 2 ** bits;
    }
    return { resolved: true, value };
  }
  if (expression?.kind === "arithmetic-shift") {
    if (!Number.isInteger(expression.count) || Math.abs(expression.count) > 31) {
      return { resolved: false, reason: "frame-field-expression-shift" };
    }
    const operand = evaluate(expression.operand);
    if (!operand.resolved) return operand;
    return { resolved: true, value: expression.count < 0
      ? (operand.value | 0) >> -expression.count
      : (operand.value << expression.count) >>> 0 };
  }
  if (expression?.kind === "float32-from-word") {
    const operand = evaluate(expression.operand);
    return operand.resolved
      ? { resolved: true, value: nativeFloat32FromWord(operand.value) }
      : operand;
  }
  if (expression?.kind === "float32-word") {
    const operand = evaluate(expression.operand);
    return operand.resolved && Number.isFinite(operand.value)
      ? { resolved: true, value: nativeFloat32Word(operand.value) }
      : { resolved: false, reason: "frame-field-expression-float32-word-nonfinite" };
  }
  if (expression?.kind === "signed-integer-to-float32") {
    const operand = evaluate(expression.operand);
    return operand.resolved
      ? { resolved: true, value: Math.fround(operand.value | 0) }
      : operand;
  }
  if (["float32-divide", "float32-multiply"].includes(expression?.kind)) {
    const left = evaluate(expression.left);
    if (!left.resolved) return left;
    const right = evaluate(expression.right);
    if (!right.resolved) return right;
    const value = Math.fround(expression.kind === "float32-divide"
      ? left.value / right.value
      : left.value * right.value);
    return Number.isFinite(value)
      ? { resolved: true, value }
      : { resolved: false, reason: "frame-field-expression-float32-result-nonfinite" };
  }
  if (expression?.kind === "float32-truncate-to-signed-integer") {
    const operand = evaluate(expression.operand);
    if (!operand.resolved) return operand;
    if (!Number.isFinite(operand.value)
      || operand.value < -0x80000000 || operand.value >= 0x80000000) {
      return { resolved: false, reason: "frame-field-expression-ftrc-out-of-range" };
    }
    return { resolved: true, value: Math.trunc(operand.value) >>> 0 };
  }
  if (["add", "subtract", "multiply", "bitwise-and"].includes(expression?.kind)) {
    const left = evaluate(expression.left);
    if (!left.resolved) return left;
    const right = evaluate(expression.right);
    if (!right.resolved) return right;
    const value = {
      add: () => ((left.value >>> 0) + (right.value >>> 0)) >>> 0,
      subtract: () => ((left.value >>> 0) - (right.value >>> 0)) >>> 0,
      multiply: () => Math.imul(left.value, right.value) >>> 0,
      "bitwise-and": () => (left.value & right.value) >>> 0,
    }[expression.kind]();
    return { resolved: true, value };
  }
  return { resolved: false, reason: `frame-field-expression-unhandled:${expression?.kind}` };
}
