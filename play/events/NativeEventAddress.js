const ADDRESS_KINDS = new Set(["frame-address", "scene-address"]);

function requireAddressOperand(operand) {
  if (
    !ADDRESS_KINDS.has(operand?.kind)
    || !Number.isSafeInteger(operand.offset)
    || operand.offset < 0
  ) {
    throw new TypeError(
      "native address must be a non-negative frame or scene address",
    );
  }
  return operand;
}

function requireWordCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("native address word count must be non-negative");
  }
  return count;
}

function fieldReader(operand, context) {
  const read = operand.kind === "frame-address"
    ? context.readFrameField
    : context.readSceneField;
  if (typeof read !== "function") {
    throw new Error(`${operand.kind}-reader-missing`);
  }
  return read;
}

function fieldWriter(operand, context) {
  const write = operand.kind === "frame-address"
    ? context.writeFrameField
    : context.writeSceneField;
  if (typeof write !== "function") {
    throw new Error(`${operand.kind}-writer-missing`);
  }
  return write;
}

export function isNativeAddressOperand(operand) {
  return (
    ADDRESS_KINDS.has(operand?.kind)
    && Number.isSafeInteger(operand.offset)
    && operand.offset >= 0
  );
}

export function advanceNativeAddressOperand(operand, byteOffset) {
  requireAddressOperand(operand);
  if (!Number.isSafeInteger(byteOffset)) {
    throw new TypeError("native address byte offset must be an integer");
  }
  const offset = operand.offset + byteOffset;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("advanced native address is outside the address space");
  }
  return { kind: operand.kind, offset };
}

export function readNativeAddressWords(
  operand,
  context,
  count,
  stride = 4,
) {
  requireAddressOperand(operand);
  requireWordCount(count);
  if (!Number.isSafeInteger(stride) || stride <= 0) {
    throw new RangeError("native address word stride must be positive");
  }
  const read = fieldReader(operand, context);
  return Array.from({ length: count }, (_, index) => {
    const offset = operand.offset + index * stride;
    const value = read(offset);
    if (!Number.isInteger(value)) {
      throw new Error(
        `${operand.kind} word at offset 0x${offset.toString(16)} is unavailable`,
      );
    }
    return value >>> 0;
  });
}

export function readAvailableNativeAddressWords(
  operand,
  context,
  count,
  stride = 4,
) {
  requireAddressOperand(operand);
  requireWordCount(count);
  if (!Number.isSafeInteger(stride) || stride <= 0) {
    throw new RangeError("native address word stride must be positive");
  }
  const read = fieldReader(operand, context);
  const values = Array.from({ length: count }, (_, index) => (
    read(operand.offset + index * stride)
  ));
  return values.every(Number.isInteger)
    ? values.map(value => value >>> 0)
    : undefined;
}

export function readAvailableNativeOperandWords(
  operand,
  context,
  count,
  stride = 4,
) {
  requireWordCount(count);
  if (operand?.kind === "static-pointer") {
    if (
      !Array.isArray(operand.staticWords)
      || operand.staticWords.length !== count
      || operand.staticWords.some(word => !Number.isInteger(word))
    ) {
      return undefined;
    }
    return operand.staticWords.map(word => word >>> 0);
  }
  if (!isNativeAddressOperand(operand)) return undefined;
  return readAvailableNativeAddressWords(
    operand,
    context,
    count,
    stride,
  );
}

export function writeNativeAddressWords(
  operand,
  context,
  words,
  source,
  stride = 4,
) {
  requireAddressOperand(operand);
  if (!Array.isArray(words) || words.some(word => !Number.isInteger(word))) {
    throw new TypeError("native address words must be an integer array");
  }
  if (!Number.isSafeInteger(stride) || stride <= 0) {
    throw new RangeError("native address word stride must be positive");
  }
  const write = fieldWriter(operand, context);
  const values = words.map(word => word >>> 0);
  values.forEach((value, index) => write({
    offset: operand.offset + index * stride,
    width: 4,
    value,
    ...(source === undefined ? {} : { source }),
  }));
  return values;
}
