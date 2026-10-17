// Only authorization/results cross the server boundary, never combat rules or AI.
export function storyCombatContract(catalog) {
  return { schema: "new-yokosuka-story-combat-results-v1", encounters: catalog.encounters.filter(e => !e.training).map(e => ({
    id: e.id, label: e.label,
    outcomes: e.practiceDurationMs ? ["practiced", "failure"] : ["success", "defeated", "failure"],
  })) };
}
