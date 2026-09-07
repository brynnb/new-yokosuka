// Default.xbe's native NPC dispatcher indexes this byte table at 0x4ec108.
// Each entry is the serialized command length in 32-bit words. Keeping the
// complete native table here is important: treating an unknown command as a
// one-word opcode desynchronizes every operation that follows it.
export const SHENMUE2_NPC_OPCODE_WORD_COUNTS = Object.freeze([
  1, 2, 2, 2, 3, 2, 2, 5,
  6, 4, 3, 5, 3, 2, 2, 3,
  7, 2, 3, 2, 2, 2, 2, 2,
  2, 6, 2, 3, 2, 4, 5, 3,
  2, 2, 5, 5, 2, 3, 4, 3,
  9, 2, 4, 5, 3, 3, 2, 2,
  3, 2, 2, 2, 2, 2, 2, 3,
  3, 3, 2,
]);

export function shenmue2NpcOpcodeWordCount(opcode) {
  return Number.isInteger(opcode)
    ? SHENMUE2_NPC_OPCODE_WORD_COUNTS[opcode] ?? null
    : null;
}

export function shenmue2NpcProgramIsAligned(words, start, end) {
  let cursor = start;
  while (cursor < end) {
    const wordCount = shenmue2NpcOpcodeWordCount(words[cursor]);
    if (wordCount === null || cursor + wordCount > end) return false;
    cursor += wordCount;
  }
  return cursor === end;
}
