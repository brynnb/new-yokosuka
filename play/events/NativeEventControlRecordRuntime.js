const FIELD_DEFINITIONS = Object.freeze([
  { name: "word04", offset: 0x04, width: 2 },
  { name: "word08", offset: 0x08, width: 2 },
  { name: "word0a", offset: 0x0a, width: 2 },
  { name: "byte0c", offset: 0x0c, width: 1 },
  { name: "byte0d", offset: 0x0d, width: 1 },
  { name: "byte0e", offset: 0x0e, width: 1 },
  { name: "byte0f", offset: 0x0f, width: 1 },
  { name: "word12", offset: 0x12, width: 2 },
]);

function requireField(value, definition) {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `native event control ${definition.name} must be an integer`,
    );
  }
  const mask = definition.width === 1 ? 0xff : 0xffff;
  return value & mask;
}

export class NativeEventControlRecordState {
  constructor() {
    this.record = undefined;
  }

  configure(values) {
    if (!values || typeof values !== "object") {
      throw new TypeError("native event control record is required");
    }
    this.record = Object.fromEntries(
      FIELD_DEFINITIONS.map(definition => [
        definition.name,
        requireField(values[definition.name], definition),
      ]),
    );
    return this.read();
  }

  read() {
    return this.record ? { ...this.record } : undefined;
  }

  writeControllerInput(mask) {
    if (!this.record) {
      throw new Error("native current event control record is unavailable");
    }
    if (!Number.isInteger(mask)) {
      throw new TypeError("native event controller input must be an integer");
    }
    const value = mask & 0xffff;
    this.record.word08 = value;
    this.record.word0a = value;
    return this.read();
  }

  clear() {
    const previous = this.read();
    this.record = undefined;
    return previous;
  }

  query(selector) {
    if (!Number.isInteger(selector)) {
      throw new TypeError("native event control selector must be an integer");
    }
    const definition = FIELD_DEFINITIONS[selector];
    if (!definition) {
      throw new RangeError(
        "native event control selector must be between zero and seven",
      );
    }
    if (!this.record) {
      throw new Error("native current event control record is unavailable");
    }
    return {
      selector,
      offset: definition.offset,
      width: definition.width,
      result: this.record[definition.name],
    };
  }
}

export function createNativeEventControlRecordState() {
  return new NativeEventControlRecordState();
}

export function createNativeEventControlRecordSemanticHandlers({
  queryCurrentEventControlField,
} = {}) {
  return {
    "current-event-control-field-query": async ({
      context,
      readArgument,
    }) => {
      const queryField = (
        queryCurrentEventControlField
        || context.queryCurrentEventControlField
      );
      if (typeof queryField !== "function") {
        return {
          status: "stopped",
          reason: "current-event-control-record-adapter-missing",
        };
      }
      let query;
      try {
        query = await queryField(readArgument(0));
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (!query || !Number.isInteger(query.result)) {
        return {
          status: "stopped",
          reason: "current-event-control-field-result-invalid",
        };
      }
      return { result: query.result, query };
    },
  };
}
