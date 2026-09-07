function freezeScenario(scenario) {
  return Object.freeze({
    ...scenario,
    spawn: Object.freeze({
      ...scenario.spawn,
      position: Object.freeze([...scenario.spawn.position]),
    }),
    nativeDialogueWrites: Object.freeze(
      scenario.nativeDialogueWrites.map(write => Object.freeze({ ...write })),
    ),
  });
}

// Scenario positions and state come from recovered script/placement data. Keep
// this catalog explicit: inferred "make the branch pass" state belongs in a
// draft/debug report, not in a runnable deterministic scenario.
export const SCRIPT_DEBUG_SCENARIOS = Object.freeze([
  freezeScenario({
    id: "d000-phone-book-ready",
    label: "Dobuita: phone book (ready)",
    worldId: "dobuita",
    script: Object.freeze({
      kind: "native",
      programId: "disc1-d000-phone-book-0x6a49c",
      entryFunction: "0x6a49c",
      objectTag: "TBK1",
    }),
    // Browser-space conversion of the player pose authored by the TBK1 event.
    spawn: {
      position: [-37.297298431396484, 0.07240000367164612, 9.767499923706055],
      yaw: 100 * Math.PI / 180,
    },
    nativeDialogueWrites: [
      { bank: 2, index: 180, value: 1 },
      { bank: 2, index: 190, value: 0 },
    ],
  }),
]);

export function scriptDebugScenarioById(id) {
  return SCRIPT_DEBUG_SCENARIOS.find(scenario => scenario.id === id) ?? null;
}
