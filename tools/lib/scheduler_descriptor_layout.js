// Word widths recovered from the scheduler's operation dispatcher at
// 0x0c119444 in 1ST_READ.BIN. Operation 0x16 stores its own word width in
// operand four.
const FIXED_WORD_LENGTHS = new Map([
  [0x00, 1],
  [0x01, 4],
  [0x02, 2],
  [0x03, 5],
  [0x04, 2],
  [0x05, 6],
  [0x07, 2],
  [0x08, 2],
  [0x09, 2],
  [0x0b, 6],
  [0x0c, 3],
  [0x0d, 1],
  [0x0f, 2],
  [0x10, 12],
  [0x11, 2],
  [0x12, 1],
  [0x13, 5],
  [0x15, 5],
  [0x19, 6],
  [0x1a, 4],
  [0x1b, 5],
  [0x1c, 7],
  [0x1d, 9],
  [0x1e, 1],
  [0x1f, 1],
  [0x20, 1],
  [0x21, 3],
  [0x24, 7],
  [0x28, 2],
  [0x2a, 9],
  [0x2b, 2],
  [0x2f, 5],
  [0x30, 4],
  [0x33, 3],
  [0x34, 5],
  [0x35, 2],
  [0x36, 4],
  [0x37, 2],
  [0x38, 2],
  [0x39, 3],
  [0x3a, 1],
  [0x3b, 1],
  [0x3c, 3],
  [0x3d, 1],
]);

// The dispatcher calls its registered extension handler before the switch.
// Shenmue's handler at 0x0c0f5b28 recognizes these three operations and its
// individual handlers return their byte widths: 0x38, 0x28, and 0x0c.
FIXED_WORD_LENGTHS.set(0x17, 0x38 / 4);
FIXED_WORD_LENGTHS.set(0x18, 0x28 / 4);
FIXED_WORD_LENGTHS.set(0x22, 0x0c / 4);

export function descriptorOperationWordLength(
  operation,
  readWord,
  cursor,
) {
  if (operation === 0x16) {
    const length = readWord(cursor + 16);
    return Number.isInteger(length) && length >= 5 && length <= 0x100
      ? length
      : null;
  }
  return FIXED_WORD_LENGTHS.get(operation) ?? null;
}

export const DESCRIPTOR_DISPATCHER_ADDRESS = "0x0c119444";
export const DESCRIPTOR_EXTENSION_HANDLER_ADDRESS = "0x0c0f5b28";
export const OPERATION_ONE_HANDLER_ADDRESS = "0x0c11f948";
export const OPERATION_ONE_ROUTE_COMPLETION_STATE_OFFSET = "0xf4";
export const OPERATION_35_ACTOR_OVERRIDE_OFFSET = "0x1c0";
export const OPERATION_08_HANDLER_ADDRESS = "0x0c1195d8";
export const OPERATION_08_ACTOR_AREA_CODE_OFFSET = "0x0c";
export const OPERATION_08_ACTOR_POSITION_OFFSET = "0x24";
export const OPERATION_08_LINKED_ACTOR_POINTER_OFFSET = "0x7c";
export const OPERATION_09_HANDLER_ADDRESS = "0x0c1195fc";
export const OPERATION_09_ACTOR_STATE_OFFSET = "0x14";
export const OPERATION_0F_HANDLER_ADDRESS = "0x0c119622";
export const OPERATION_0F_ACTOR_QUERY_STATE_OFFSET = "0x90";
export const OPERATION_0F_ACTOR_QUERY_ADDRESS = "0x0c119888";
export const OPERATION_28_HANDLER_ADDRESS = "0x0c119608";
export const OPERATION_28_ACTOR_BOOLEAN_MODE_OFFSET = "0x149";
export const OPERATION_38_HANDLER_ADDRESS = "0x0c1197ec";
export const OPERATION_38_ACTOR_BOUNDS_MODE_OFFSET = "0x1d1";
export const OPERATION_38_BOUNDS_REFRESH_ADDRESS = "0x0c11a382";
export const SCHEDULED_ACTOR_LOOKUP_ADDRESS = "0x0c11bf5c";
export const SCHEDULED_ACTOR_LINK_INITIALIZER_ADDRESS = "0x0c11bfb0";
export const SCHEDULED_ACTOR_LINK_UPDATE_ADDRESS = "0x0c11b63c";
export const SCHEDULED_ACTOR_RECORD_ARRAY_POINTER_ADDRESS = "0x0c21bcb4";
export const SCHEDULED_ACTOR_RECORD_COUNT_ADDRESS = "0x0c21bcbc";
export const SCHEDULED_ACTOR_RECORD_STRIDE = 0x1f0;
export const SCHEDULED_ACTOR_DEFINITION_POINTER_OFFSET = 0x00;
export const SCHEDULED_ACTOR_DEFINITION_CODE_OFFSET = 0x04;
export const SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_TABLE_OFFSET = 0x7c;
export const SCHEDULED_ACTOR_DEFINITION_DEFAULT_MOTION_OFFSET = 0x7c;
export const SCHEDULED_ACTOR_DEFINITION_DEFAULT_IDLE_OFFSETS = Object.freeze([
  0x7e,
  0x80,
  0x82,
  0x84,
]);
export const OPERATION_2B_HANDLER_POINTER_LITERAL_ADDRESS = "0x0c1197a4";
export const OPERATION_2B_CHARACTER_LOOKUP_ADDRESS = "0x0c1147ec";
export const OPERATION_2B_CHARACTER_TABLE_POINTER_ADDRESS = "0x0c21bc80";
export const OPERATION_2B_ACTOR_CHARACTER_INDEX_OFFSET = "0x08";
export const OPERATION_2A_HANDLER_POINTER_LITERAL_ADDRESS = "0x0c1197a0";
export const OPERATION_2A_SCENE_OBJECT_HANDLER_ADDRESS = "0x0c0f9efa";
export const OPERATION_2A_SCENE_OBJECT_STATE_ADDRESS = "0x0c0f9c90";
export const OPERATION_2A_ACTOR_OBJECT_CODE_OFFSET = "0xc8";
export const OPERATION_2A_ACTOR_CONTROL_OFFSET = "0xd4";
export const OPERATION_22_HANDLER_ADDRESS = "0x0c0f90f2";
export const OPERATION_22_INITIALIZER_ADDRESS = "0x0c0f8f48";
export const OPERATION_22_UPDATE_ADDRESS = "0x0c0f8f8c";
export const OPERATION_22_RANDOM_CALL_LITERAL_ADDRESS = "0x0c0f9120";
export const OPERATION_22_SIGNED_REMAINDER_CALL_LITERAL_ADDRESS =
  "0x0c0f9124";
export const OPERATION_22_RANDOM_FUNCTION_ADDRESS = "0x0c1ce1f0";
export const OPERATION_22_RANDOM_SEED_ADDRESS = "0x0c2a1d58";
export const OPERATION_22_ACTOR_OPERATION_POINTER_OFFSET = "0xac";
export const OPERATION_22_ACTOR_TARGET_SECOND_OFFSET = "0xcc";
export const OPERATION_22_ACTOR_SELECTED_INDEX_OFFSET = "0xd0";
export const OPERATION_22_ACTOR_CANDIDATE_COUNT_OFFSET = "0xd4";
export const OPERATION_22_ACTOR_MOTION_STATE_OFFSET = "0x06";
export const OPERATION_18_HANDLER_ADDRESS = "0x0c0f9812";
export const OPERATION_18_SUBTYPE_ONE_HANDLER_ADDRESS = "0x0c0f8ec0";
export const OPERATION_18_SUBTYPE_THREE_HANDLER_ADDRESS = "0x0c0f6b38";
export const OPERATION_18_INITIALIZER_ADDRESS = "0x0c0f96f0";
export const OPERATION_18_ACTOR_STATE_OFFSET = "0xd4";
export const OPERATION_18_ACTOR_OPERATION_POINTER_OFFSET = "0xd8";
export const OPERATION_18_ACTOR_TARGET_REGISTRY_POINTER_OFFSET = "0xdc";
export const OPERATION_18_ACTOR_TARGET_SECOND_OFFSET = "0xe0";
export const OPERATION_17_WIDTH_HANDLER_ADDRESS = "0x0c0f9566";
export const OPERATION_17_INITIALIZER_ADDRESS = "0x0c0f956a";
export const OPERATION_17_UPDATE_ADDRESS = "0x0c0f9630";
export const OPERATION_17_DESCRIPTOR_HANDLER_ADDRESS = "0x0c0f96d0";
export const OPERATION_17_ACTIVE_PREDICATE_ADDRESS = "0x0c0f987c";
export const OPERATION_17_ACTOR_REGISTRATION_POINTER_OFFSET = "0xa4";
export const OPERATION_17_ACTOR_STATE_OFFSET = "0xd4";
export const OPERATION_17_ACTOR_OPERATION_POINTER_OFFSET = "0xd8";
export const OPERATION_17_ACTOR_TARGET_REGISTRY_POINTER_OFFSET = "0xdc";
export const OPERATION_2F_HANDLER_POINTER_LITERAL_ADDRESS = "0x0c1197a8";
export const OPERATION_2F_MODEL_OVERRIDE_HANDLER_ADDRESS = "0x0c11acd8";
export const OPERATION_2F_ACTOR_MODEL_POINTER_OFFSET = "0x8c";
export const OPERATION_2F_ACTOR_MODEL_OVERRIDE_OFFSET = "0x18e";
export const DESCRIPTOR_TERMINAL_OPERATIONS = new Set([0x00, 0x04, 0x12]);
// These cases only advance the descriptor pointer in the native dispatcher.
// The registered extension at 0x0c0f5b28 recognizes only 0x17, 0x18, and
// 0x22, so these operations have no scheduler-side state or placement effect.
export const DESCRIPTOR_PASS_THROUGH_OPERATIONS = new Set([
  0x0b, 0x0c, 0x0d, 0x15, 0x1b, 0x1e, 0x1f,
  0x21, 0x36, 0x37, 0x39, 0x3a, 0x3b, 0x3c, 0x3d,
]);
// Cases 0x05 and 0x13 explicitly clear actor current-operation +0x04 before
// advancing. They do not alter the actor transform.
export const DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS = new Set([
  0x05,
  0x13,
]);
export const DESCRIPTOR_CONTINUATION_POINTER_OPERATION = 0x20;

// Operation 0x16 owns a compact subordinate command stream. The native
// iterator at 0x0c126494 advances these exact widths; recordCount excludes the
// final 0x27 terminator.
export const OPERATION_16_RECORD_WORD_LENGTHS = new Map([
  [0x02, 2],
  [0x07, 2],
  [0x10, 12],
  [0x11, 2],
  [0x1a, 4],
  [0x27, 1],
  [0x2d, 12],
  [0x2e, 2],
]);
