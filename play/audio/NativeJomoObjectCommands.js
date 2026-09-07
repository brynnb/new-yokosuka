export const JOMO_OBJECT_AUDIO_BANK = "f1omoyaa";

export const JOMO_DRAWER_PHASE_COMMANDS = Object.freeze({
  openingStart: "a9050b00",
  closingStart: "a9050a00",
  closingImpact: "a9056400",
});

const JOMO_GROUP_ZERO_DRAWER_TAGS = new Set([
  "ATS1",
  "ATS2",
  "ATS3",
  "ATS4",
  "ATS5",
  "ATS6",
]);

export function nativeJomoDrawerPhaseCommand(objectTag, phase) {
  if (!JOMO_GROUP_ZERO_DRAWER_TAGS.has(objectTag)) return null;
  return JOMO_DRAWER_PHASE_COMMANDS[phase] || null;
}
