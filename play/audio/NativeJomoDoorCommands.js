export const JOMO_DOOR_AUDIO_BANK = "f1omoyaa";

const pair = (openingStart, closingStart) => Object.freeze({
  openingStart,
  closingStart,
});

export const JOMO_DOOR_PHASE_COMMANDS_BY_MODEL = Object.freeze({
  "S1_JOMO_DR15_026.MT5": pair("ab020200", "ab020300"),
  "S1_JOMO_DR15_029.MT5": pair("ab020400", "ab020500"),
  "S1_JOMO_DR01_015.MT5": pair("ab020000", "ab020100"),
  "S1_JOMO_DR15_028.MT5": pair("ab020600", "ab020700"),
  "S1_JOMO_DR15_016.MT5": pair("ab020800", "ab020900"),
  "S1_JOMO_DR01_016.MT5": pair("ab020000", "ab020100"),
  "S1_JOMO_DR23_000.MT5": pair("ab020200", "ab020300"),
});

export const JOMO_DR23_DOOR_PHASE_COMMANDS =
  JOMO_DOOR_PHASE_COMMANDS_BY_MODEL["S1_JOMO_DR23_000.MT5"];

export function nativeJomoDoorPhaseCommand(model, phase) {
  return JOMO_DOOR_PHASE_COMMANDS_BY_MODEL[model]?.[phase] || null;
}
