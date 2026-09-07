// 1ST_READ.BIN 0x0c29c068: the exact 23-entry surface-to-AB03 command
// table consumed by FUN_0c17bb14.
export const NATIVE_FOOTSTEP_SURFACE_COMMANDS = Object.freeze([
  [0x40, 0x80],
  [0x00, 0x00],
  [0x04, 0x00],
  [0x08, 0x00],
  [0x0c, 0x00],
  [0x10, 0x00],
  [0x14, 0x00],
  [0x18, 0x00],
  [0x1c, 0x80],
  [0x20, 0x80],
  [0x24, 0x80],
  [0x28, 0x80],
  [0x2c, 0x80],
  [0x30, 0x80],
  [0x34, 0x80],
  [0x38, 0x00],
  [0x3c, 0x00],
  [0x40, 0x80],
  [0x45, 0x00],
  [0x4e, 0x00],
  [0x52, 0x00],
  [0x59, 0x00],
  [0x5d, 0x00],
].map(Object.freeze));

// Browser worlds without extracted native surface/property data use the same
// surface-zero pavement family proven for Ryo in MFSY.
export const DEFAULT_FOOTSTEP_SURFACE_INDEX = 0;

// These native AB03 tracks are joined, delayed multi-playback compositions.
// The browser packager deliberately leaves them unavailable until that timing
// format is decoded exactly instead of flattening them into a guessed mix.
const UNPACKAGED_FOOTSTEP_COMMANDS = new Set([
  "ab030b00",
  "ab030f00",
  "ab033380",
]);

export function validFootstepSurfaceIndex(value) {
  const index = Number(value);
  return Number.isInteger(index)
    && index >= 0
    && index < NATIVE_FOOTSTEP_SURFACE_COMMANDS.length
    ? index
    : null;
}

export function nativeFootstepCommand({
  surfaceIndex = DEFAULT_FOOTSTEP_SURFACE_INDEX,
  variant = 0,
} = {}) {
  const index = validFootstepSurfaceIndex(surfaceIndex);
  if (index === null) return null;
  const [baseTrack, flags] = NATIVE_FOOTSTEP_SURFACE_COMMANDS[index];
  const track = (baseTrack + Math.max(0, Math.min(3, variant | 0))) & 0xff;
  return `ab03${track.toString(16).padStart(2, "0")}${
    flags.toString(16).padStart(2, "0")
  }`;
}

export function packagedNativeFootstepCommand(options) {
  const commandHex = nativeFootstepCommand(options);
  return UNPACKAGED_FOOTSTEP_COMMANDS.has(commandHex) ? null : commandHex;
}
