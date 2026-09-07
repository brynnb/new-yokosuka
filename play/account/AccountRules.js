export const MAX_CHARACTER_SLOTS = 8;
export const QUICK_PLAY_CONFIRMATION_KEY =
  "new-yokosuka.quick-play-confirmations.v1";

export function quickPlayConfirmationCount(storage) {
  const count = Number.parseInt(
    storage?.getItem(QUICK_PLAY_CONFIRMATION_KEY) || "0",
    10,
  );
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function recordQuickPlayConfirmation(storage) {
  const count = quickPlayConfirmationCount(storage) + 1;
  storage?.setItem(QUICK_PLAY_CONFIRMATION_KEY, String(count));
  return count;
}

export function characterSlots(characters, limit = MAX_CHARACTER_SLOTS) {
  return Array.from(
    { length: limit },
    (_, index) => characters[index] || null,
  );
}

export function cycleCharacterIndex(index, direction, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  return (index + direction + count) % count;
}

export function normalizeCharacterNameCapitalization(value) {
  let capitalizeNextLetter = true;
  let preserveNextLetterCase = false;
  return Array.from(value, (character) => {
    if (/\p{L}/u.test(character)) {
      let normalized = character;
      if (capitalizeNextLetter) {
        normalized = character.toLocaleUpperCase();
      } else if (!preserveNextLetterCase) {
        normalized = character.toLocaleLowerCase();
      }
      capitalizeNextLetter = false;
      preserveNextLetterCase = false;
      return normalized;
    }
    if (character === " ") {
      capitalizeNextLetter = true;
      preserveNextLetterCase = false;
    } else if (character === "-") {
      preserveNextLetterCase = true;
    }
    return character;
  }).join("");
}
