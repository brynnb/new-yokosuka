#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_EXECUTABLE_SHA256,
  NATIVE_TYPED_COMMAND_DISPATCHER,
  TELM_CONTROLLER_END,
  TELM_CONTROLLER_START,
  TELM_STATE_COUNT,
  TELM_STATE_DISPATCH_BASE,
  TELM_STATE_TABLE,
  assertKnownExecutable,
  assignCallsToTelmStates,
  extractTelmSoundCalls,
  extractTelmStateTargets,
} from "../lib/NativeTelmAudio.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultExecutable = path.resolve(
  repoRoot,
);
const executablePath = path.resolve(process.argv[2] ?? defaultExecutable);
const catalogPath = path.resolve(
  process.argv[3]
  ?? path.join(repoRoot, ".disc-work/audio/native-audio-bank-catalog.json"),
);
const outputPath = path.resolve(
  process.argv[4]
  ?? path.join(repoRoot, "tools/evidence/native-telm-audio-calls.json"),
);

const executable = readFileSync(executablePath);
assertKnownExecutable(executable);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const extracted = assignCallsToTelmStates(
  executable,
  extractTelmSoundCalls(executable),
  extractTelmStateTargets(executable),
);

const matchesByCommand = new Map();
for (const bank of catalog.banks) {
  for (const command of bank.commands ?? []) {
    const matches = matchesByCommand.get(command.commandHex) ?? [];
    matches.push({
      sha256: bank.sha256,
      sources: bank.sources,
    });
    matchesByCommand.set(command.commandHex, matches);
  }
}

const calls = extracted.calls.map((call) => {
  const bankMatches = matchesByCommand.get(call.commandHex) ?? [];
  const uniqueSystemBank = (
    call.commandHex.startsWith("ab05")
    && bankMatches.length === 1
    && bankMatches[0].sha256
      === "d25eb40cdfc129a09f380922752891bd47e6e1714a0ddb4556fea6875dad2f59"
  );
  return {
    ...Object.fromEntries(Object.entries(call).map(([key, value]) => [
      key.endsWith("Address") && typeof value === "number"
        ? key
        : key,
      key.endsWith("Address") && typeof value === "number"
        ? `0x${value.toString(16)}`
        : value,
    ])),
    bankMatches,
    bankResolution: uniqueSystemBank
      ? "unique-system1-bank"
      : "runtime-location-bank-required",
  };
});

const states = extracted.states.map((state) => ({
  state: state.state,
  tableAddress: `0x${state.tableAddress.toString(16)}`,
  relative: state.relative,
  targetAddress: `0x${state.targetAddress.toString(16)}`,
  soundCallAddresses: state.soundCallAddresses.map(
    (address) => `0x${address.toString(16)}`,
  ),
}));
const commandCounts = Object.fromEntries(
  [...new Set(calls.map(({ commandHex }) => commandHex))]
    .sort()
    .map((commandHex) => [
      commandHex,
      calls.filter((call) => call.commandHex === commandHex).length,
    ]),
);

const evidence = {
  schema: "new-yokosuka-native-telm-audio-calls-v1",
  status: "exact-controller-commands-and-state-reachability",
  generatedBy: "tools/audio/extract_native_telm_audio.mjs",
  source: {
    executable: "1ST_READ.BIN",
    executableSha256: EXPECTED_EXECUTABLE_SHA256,
    runtimeBase: "0x0c010000",
  },
  controller: {
    range: [
      `0x${TELM_CONTROLLER_START.toString(16)}`,
      `0x${TELM_CONTROLLER_END.toString(16)}`,
    ],
    stateTableAddress: `0x${TELM_STATE_TABLE.toString(16)}`,
    stateDispatchBaseAddress: `0x${TELM_STATE_DISPATCH_BASE.toString(16)}`,
    stateCount: TELM_STATE_COUNT,
    typedCommandDispatcherAddress: (
      `0x${NATIVE_TYPED_COMMAND_DISPATCHER.toString(16)}`
    ),
  },
  summary: {
    stateCount: states.length,
    controllerSoundCallCount: calls.length,
    stateReachableSoundCallCount: calls.filter(
      ({ reachableFromStates }) => reachableFromStates.length > 0,
    ).length,
    initializationSoundCallCount: calls.filter(
      ({ reachableFromStates }) => reachableFromStates.length === 0,
    ).length,
    uniqueCommandCount: Object.keys(commandCounts).length,
    commandCounts,
  },
  states,
  calls,
  semanticBoundary: [
    "State reachability follows native SH-4 direct control flow, delay slots, "
      + "and locally constant tail jumps without executing subroutine calls.",
    "AB05 commands uniquely resolve to SYSTEM1.SND in the all-disc catalog.",
    "AB06 commands are supplied by the active location bank; catalog matches "
      + "remain candidates until a location or MAPINFO context selects one.",
    "Numeric controller states and tracks are not assigned inferred action "
      + "names without independent script, animation, or emulator evidence.",
    "Address 0x0c17a91c is a shared typed-command dispatcher, not an "
      + "audio-only function. These TELM sites are sound calls because their "
      + "recovered constant commands are AB05/AB06.",
  ],
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Wrote ${calls.length} TELM controller sound calls across `
  + `${states.length} states to ${outputPath}`,
);
