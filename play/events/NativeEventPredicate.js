import {
  nativeFloat32FromWord,
} from "./NativeEventNumericRuntime.js";

function resolved(value, successor) {
  return {
    resolved: true,
    value,
    successor,
    reason: null,
  };
}

function unresolved(reason) {
  return {
    resolved: false,
    value: null,
    successor: null,
    reason,
  };
}

function integer(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function number(value) {
  if (typeof value === "number") return integer(value);
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 0);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function signExtend(value, width) {
  const bits = width * 8;
  if (bits === 32) return value | 0;
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

function loadedRegisterBits(value, comparison) {
  const width = comparison.loadWidth;
  if (![1, 2, 4].includes(width)) return null;
  if (comparison.signedLoad) {
    return signExtend(value, width) >>> 0;
  }
  if (width === 4) return value >>> 0;
  const mask = (2 ** (width * 8)) - 1;
  return (value & mask) >>> 0;
}

function comparisonValue(mnemonic, leftBits, rightBits) {
  switch (mnemonic) {
    case "cmp/eq":
      return rightBits === leftBits;
    case "cmp/ge":
      return (rightBits | 0) >= (leftBits | 0);
    case "cmp/gt":
      return (rightBits | 0) > (leftBits | 0);
    case "cmp/hi":
      return (rightBits >>> 0) > (leftBits >>> 0);
    case "cmp/hs":
      return (rightBits >>> 0) >= (leftBits >>> 0);
    default:
      return null;
  }
}

function evaluateFieldExpression(expression, readField, fieldKind) {
  if (expression?.kind === "constant" && Number.isInteger(expression.value)) {
    return { resolved: true, value: expression.value >>> 0 };
  }
  if (
    expression?.kind === "frame-field"
    && Number.isInteger(expression.offset)
    && [1, 2, 4].includes(expression.width)
  ) {
    if (typeof readField !== "function") {
      return {
        resolved: false,
        reason: `${fieldKind}-field-reader-missing:${expression.offset}`,
      };
    }
    const raw = readField({
      offset: expression.offset,
      width: expression.width,
      signedLoad: Boolean(expression.signedLoad),
    });
    if (!Number.isInteger(raw)) {
      return {
        resolved: false,
        reason: `${fieldKind}-field-unavailable:${expression.offset}`,
      };
    }
    return {
      resolved: true,
      value: loadedRegisterBits(raw, {
        loadWidth: expression.width,
        signedLoad: expression.signedLoad,
      }),
    };
  }
  if (expression?.kind === "float32-from-word") {
    const operand = evaluateFieldExpression(
      expression.operand,
      readField,
      fieldKind,
    );
    return operand.resolved
      ? { resolved: true, value: nativeFloat32FromWord(operand.value) }
      : operand;
  }
  if ([
    "equal",
    "float32-greater-than",
    "signed-greater-than",
    "signed-greater-or-equal",
    "unsigned-greater-than",
    "unsigned-greater-or-equal",
    "bitwise-and",
    "bitwise-or",
  ].includes(expression?.kind)) {
    const left = evaluateFieldExpression(expression.left, readField, fieldKind);
    if (!left.resolved) return left;
    const right = evaluateFieldExpression(expression.right, readField, fieldKind);
    if (!right.resolved) return right;
    return {
      resolved: true,
      value: {
        equal: () => left.value === right.value,
        "float32-greater-than": () => left.value > right.value,
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
        "bitwise-and": () => (left.value & right.value) >>> 0,
        "bitwise-or": () => (left.value | right.value) >>> 0,
      }[expression.kind](),
    };
  }
  if (expression?.kind === "boolean-mask") {
    const operand = evaluateFieldExpression(
      expression.operand,
      readField,
      fieldKind,
    );
    return operand.resolved
      ? { resolved: true, value: operand.value ? 0xffffffff : 0 }
      : operand;
  }
  return {
    resolved: false,
    reason: `${fieldKind}-expression-unhandled:${expression?.kind}`,
  };
}

function evaluateNativeFieldComparison(
  comparison,
  readField,
  fieldKind,
) {
  if (!comparison || typeof comparison !== "object") {
    return unresolved("scene-comparison-missing");
  }
  if (
    comparison.comparison === "frame-expression"
    && comparison.expression
  ) {
    const evaluated = evaluateFieldExpression(
      comparison.expression,
      readField,
      fieldKind,
    );
    if (!evaluated.resolved) return unresolved(evaluated.reason);
    if (typeof evaluated.value !== "boolean") {
      return unresolved(`${fieldKind}-expression-result-not-boolean`);
    }
    const branch = comparison.resolvedBranch;
    const successor = evaluated.value
      ? branch?.comparisonTrueSuccessor
      : branch?.comparisonFalseSuccessor;
    return successor
      ? resolved(evaluated.value, successor)
      : unresolved(`${fieldKind}-comparison-branch-unresolved`);
  }
  const fieldOffset = number(comparison.fieldOffset);
  if (fieldOffset === null) {
    return unresolved("scene-field-offset-invalid");
  }
  if (typeof readField !== "function") {
    return unresolved(
      `${fieldKind}-field-reader-missing:${comparison.fieldOffset}`,
    );
  }
  const rawValue = readField({
    offset: fieldOffset,
    width: comparison.loadWidth,
    signedLoad: Boolean(comparison.signedLoad),
    source: {
      fieldLoadFileOffset: comparison.fieldLoadFileOffset,
      compareFileOffset: comparison.compareFileOffset,
    },
  });
  const fieldValue = integer(rawValue);
  if (fieldValue === null) {
    return unresolved(
      `${fieldKind}-field-unavailable:${comparison.fieldOffset}`,
    );
  }
  const fieldBits = loadedRegisterBits(fieldValue, comparison);
  if (
    comparison.comparison === "bit-mask-equal-zero"
    && fieldBits !== null
    && Number.isSafeInteger(comparison.mask)
  ) {
    const value = (fieldBits & (comparison.mask >>> 0)) === 0;
    const branch = comparison.resolvedBranch;
    const successor = value
      ? branch?.comparisonTrueSuccessor
      : branch?.comparisonFalseSuccessor;
    return successor
      ? resolved(value, successor)
      : unresolved("scene-comparison-branch-unresolved");
  }
  let otherFieldBits = null;
  if (comparison.otherFieldOffset !== undefined) {
    const otherOffset = number(comparison.otherFieldOffset);
    if (otherOffset === null) {
      return unresolved(`${fieldKind}-other-field-offset-invalid`);
    }
    const otherRawValue = readField({
      offset: otherOffset,
      width: comparison.otherLoadWidth,
      signedLoad: Boolean(comparison.otherSignedLoad),
      source: {
        compareFileOffset: comparison.compareFileOffset,
      },
    });
    if (integer(otherRawValue) === null) {
      return unresolved(`${fieldKind}-field-unavailable:${otherOffset}`);
    }
    otherFieldBits = loadedRegisterBits(otherRawValue, {
      loadWidth: comparison.otherLoadWidth,
      signedLoad: comparison.otherSignedLoad,
    });
  }
  if (
    fieldBits === null
    || (
      otherFieldBits === null
      && !Number.isSafeInteger(comparison.constant)
    )
  ) {
    return unresolved("scene-comparison-operands-invalid");
  }
  const registers = {
    [comparison.fieldOperand]: fieldBits,
    ...(otherFieldBits !== null
      ? { [comparison.otherFieldOperand]: otherFieldBits }
      : { [comparison.constantOperand]: comparison.constant >>> 0 }),
  };
  if (
    typeof comparison.constantOperand === "string"
    && comparison.constantOperand.startsWith("#")
  ) {
    const transferredFieldOperand = (
      comparison.leftOperand === comparison.constantOperand
        ? comparison.rightOperand
        : comparison.rightOperand === comparison.constantOperand
          ? comparison.leftOperand
          : null
    );
    if (
      transferredFieldOperand
      && registers[transferredFieldOperand] === undefined
    ) {
      registers[transferredFieldOperand] = fieldBits;
    }
  }
  const leftBits = registers[comparison.leftOperand];
  const rightBits = registers[comparison.rightOperand];
  if (leftBits === undefined || rightBits === undefined) {
    return unresolved("scene-comparison-operand-roles-missing");
  }
  const value = comparisonValue(
    comparison.comparison,
    leftBits,
    rightBits,
  );
  if (value === null) {
    return unresolved(
      `scene-comparison-unsupported:${comparison.comparison}`,
    );
  }
  const branch = comparison.resolvedBranch;
  const successor = value
    ? branch?.comparisonTrueSuccessor
    : branch?.comparisonFalseSuccessor;
  if (!successor) {
    return unresolved("scene-comparison-branch-unresolved");
  }
  return resolved(value, successor);
}

export function evaluateNativeSceneFieldComparison(
  comparison,
  { readSceneField } = {},
) {
  return evaluateNativeFieldComparison(
    comparison,
    readSceneField,
    "scene",
  );
}

export function evaluateNativeFrameFieldComparison(
  comparison,
  { readFrameField } = {},
) {
  return evaluateNativeFieldComparison(
    comparison,
    ({ offset }) => readFrameField?.(offset),
    "frame",
  );
}
