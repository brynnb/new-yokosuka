function nativeCommandHex(word) {
  if (!Number.isInteger(word)) return null;
  const value = word >>> 0;
  return [0, 8, 16, 24]
    .map(shift => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

// Only commands whose authored room bank and browser asset are both proven
// belong here. Unknown commands intentionally remain unavailable.
const ROOM_COMMANDS = Object.freeze({
  D000: Object.freeze({
    a9056800: Object.freeze({
      kind: "effect",
      exactArguments: Object.freeze([0, 0]),
      bank: "f1dobuit",
    }),
    a8250000: Object.freeze({
      kind: "music",
      exactArguments: Object.freeze([0, 0]),
      requiredSlot: 2,
      requiredBank: "bgm013.snd",
      trackId: "dobuita-selector-18",
    }),
    a0040000: Object.freeze({
      kind: "aica-driver-ignored",
      exactArguments: Object.freeze([2, 115]),
      constructedQueueWord: 0x00000002,
    }),
  }),
});

export function resolveNativeRoomSoundCommand({
  area,
  arguments: args,
  soundBankSlots = null,
  routes = null,
}) {
  if (
    !Array.isArray(args)
    || args.length !== 3
  ) {
    return null;
  }
  const commandHex = nativeCommandHex(args[0]);
  const generatedRoute = Array.isArray(routes)
    ? routes.find(candidate => (
      candidate?.commandHex?.toLowerCase() === commandHex
      && candidate?.exactArguments?.[0] === args[1]
      && candidate?.exactArguments?.[1] === args[2]
    ))
    : null;
  const route = generatedRoute || ROOM_COMMANDS[area]?.[commandHex];
  if (!route) return null;
  if (
    route.exactArguments[0] !== args[1]
    || route.exactArguments[1] !== args[2]
  ) return null;
  if (
    route.kind === "music"
    && Number.isInteger(route.requiredSlot)
    && (
      !Array.isArray(soundBankSlots)
      || soundBankSlots.length !== 8
      || soundBankSlots[route.requiredSlot]?.toLowerCase() !== route.requiredBank
    )
  ) return null;
  return { commandHex, ...route };
}

export function dispatchNativeRoomSoundCommand({
  area,
  arguments: args,
  playCommand,
  playMusicTrack,
  soundBankSlots,
  routes,
}) {
  const command = resolveNativeRoomSoundCommand({
    area,
    arguments: args,
    soundBankSlots,
    routes,
  });
  if (!command) return undefined;
  if (
    command.kind === "aica-driver-ignored"
    || command.kind === "native-control-no-output"
  ) {
    // Generated no-output routes retain the exact tuple and its proven queue
    // word; the pinned AICADRV returns before dispatching a sound handler.
  } else if (command.kind === "music") {
    if (
      typeof playMusicTrack !== "function"
      || playMusicTrack(command.trackId) !== true
    ) return undefined;
  } else {
    if (typeof playCommand !== "function") return undefined;
    playCommand(command.commandHex, { bank: command.bank });
  }
  // The native dispatcher accepts the command independently of output mute
  // state. Its return is not a browser playback-success signal.
  return 0;
}
