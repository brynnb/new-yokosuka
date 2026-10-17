// Only authorization/results cross the server boundary, never combat rules or AI.
export function storyCombatContract(catalog) {
  return { schema: "new-yokosuka-story-combat-results-v1", encounters: catalog.encounters.map(e => ({
    id: e.id, label: e.label, timeoutMs: e.timeoutMs,
    outcomes: e.practiceDurationMs ? ["practiced", "failure"] : ["success", "defeated", "failure"],
  })) };
}
