import catalog from "../data/native-d000-door-audio.json" with {
  type: "json",
};

export const D000_DOOR_AUDIO_BANK = "f1dobuit";

export function nativeD000DoorOpeningCommand(selector) {
  if (!Number.isInteger(selector)) return null;
  return catalog.selectors[String(selector)]?.openingCommand ?? null;
}

export function nativeD000DoorCommands(selector) {
  if (!Number.isInteger(selector)) return null;
  return catalog.selectors[String(selector)]?.commands ?? null;
}
