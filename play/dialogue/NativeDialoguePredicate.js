import {
  NATIVE_DIALOGUE_PREDICATE_DATA,
} from "../data/dialogue/nativePredicateValues.generated.js";

function unresolved(...reasons) {
  return {
    resolved: false,
    value: null,
    reasons: [...new Set(reasons.flat().filter(Boolean))],
  };
}

function resolved(value) {
  return {
    resolved: true,
    value: Number(value),
    reasons: [],
  };
}

function calendarComponent(mode, gameDate) {
  if (mode < 0 || mode > 5) return null;
  if (!(gameDate instanceof Date) || !Number.isFinite(gameDate.getTime())) {
    return unresolved(`runtimeComponent:${mode}:gameDate`);
  }
  switch (mode) {
    case 0:
      return resolved(gameDate.getUTCFullYear() - 1900);
    case 1:
      return resolved(gameDate.getUTCMonth() + 1);
    case 2:
      return resolved(gameDate.getUTCDate());
    case 3:
      return resolved(gameDate.getUTCDay());
    case 4:
      return resolved(gameDate.getUTCHours());
    case 5:
      return resolved(gameDate.getUTCMinutes());
    default:
      return null;
  }
}

function runtimeComponentMode(node) {
  return Number(node.mode ?? node.value);
}

function stateBankValue(node, context) {
  const bank = node.nativeValueType;
  const reader = context.readStateBank;
  if (typeof reader !== "function") {
    return unresolved(`stateBank:${bank}:${node.value}`);
  }
  const value = reader(bank, node.value);
  if (value === undefined || value === null) {
    return unresolved(`stateBank:${bank}:${node.value}`);
  }
  return resolved(value);
}

function spatialValue(index, context) {
  const record = (
    NATIVE_DIALOGUE_PREDICATE_DATA.spatialTable.records[index - 1]
  );
  if (!record) return unresolved(`nativeSpatialResult:${index}:record`);
  if (!context.currentMapIdentity) {
    return unresolved(`nativeSpatialResult:${index}:map`);
  }
  if (context.currentMapIdentity !== record.mapIdentity) return resolved(0);
  const position = context.playerPosition;
  const x = Number(position?.x ?? position?.[0]);
  const z = Number(position?.z ?? position?.[2]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return unresolved(`nativeSpatialResult:${index}:position`);
  }
  const dx = x - record.browserPosition[0];
  const dz = z - record.browserPosition[2];
  return resolved(
    dx * dx + dz * dz < record.radiusSquared ? 1 : 0,
  );
}

function operatorValue(node, context) {
  const leftNode = node.left ?? node.operand;
  const left = leftNode
    ? evaluateNativeDialoguePredicate(leftNode, context)
    : null;
  const right = node.right
    ? evaluateNativeDialoguePredicate(node.right, context)
    : null;
  switch (node.operation) {
    case "isZero":
      return left?.resolved
        ? resolved(left.value === 0 ? 1 : 0)
        : unresolved(left?.reasons);
    case "booleanAnd":
      if (left?.resolved && left.value === 0) return resolved(0);
      if (right?.resolved && right.value === 0) return resolved(0);
      if (!left?.resolved || !right?.resolved) {
        return unresolved(left?.reasons, right?.reasons);
      }
      return resolved(1);
    case "booleanOr":
      if (left?.resolved && left.value !== 0) return resolved(1);
      if (right?.resolved && right.value !== 0) return resolved(1);
      if (!left?.resolved || !right?.resolved) {
        return unresolved(left?.reasons, right?.reasons);
      }
      return resolved(0);
    default:
      if (!left?.resolved || !right?.resolved) {
        return unresolved(left?.reasons, right?.reasons);
      }
  }
  switch (node.operation) {
    case "equal":
      return resolved(left.value === right.value ? 1 : 0);
    case "notEqual":
      return resolved(left.value !== right.value ? 1 : 0);
    case "greaterThan":
      return resolved(left.value > right.value ? 1 : 0);
    case "greaterThanOrEqual":
      return resolved(left.value >= right.value ? 1 : 0);
    case "lessThan":
      return resolved(left.value < right.value ? 1 : 0);
    case "lessThanOrEqual":
      return resolved(left.value <= right.value ? 1 : 0);
    default:
      return unresolved(`operator:${node.operation || node.opcode}`);
  }
}

export function evaluateNativeDialoguePredicate(node, context = {}) {
  if (!node || typeof node !== "object") {
    return unresolved("predicate:missing");
  }
  switch (node.kind) {
    case "literal":
      return resolved(node.value);
    case "nativeValueType2":
    case "nativeValueType3":
    case "nativeValueType4":
      return stateBankValue(node, context);
    case "runtimeSelector": {
      const mode = runtimeComponentMode(node);
      const component = calendarComponent(mode, context.gameDate);
      if (component) return component;
      if (mode === 6) {
        const yen = Number(context.yen);
        return Number.isFinite(yen)
          ? resolved(yen)
          : unresolved("runtimeComponent:6:yen");
      }
      const value = context.readRuntimeComponent?.(mode);
      return value === undefined || value === null
        ? unresolved(`runtimeComponent:${mode}`)
        : resolved(value);
    }
    case "actorRuntimeIdentity": {
      const value = context.readActorRuntimeValue?.(
        node.value,
        context.currentActorCode,
      );
      return value === undefined || value === null
        ? unresolved(`actorRuntimeIdentity:${node.value}`)
        : resolved(value);
    }
    case "nativeSpatialResult":
      return spatialValue(node.value, context);
    case "operator":
      return operatorValue(node, context);
    default:
      return unresolved(`predicateKind:${node.kind}`);
  }
}

export function nativeDialoguePredicateMatches(node, context = {}) {
  const result = evaluateNativeDialoguePredicate(node, context);
  if (!result.resolved) return null;
  return result.value !== 0;
}
