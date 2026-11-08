// Explicit evidence states for the generated Story inventory. A binding is
// not proof of implementation, presentation, or a connected progression run.
const allowed = {
  implementation: new Set(["implemented", "unverified", "blocked"]),
  presentation: new Set(["rendered-partial", "unverified", "blocked"]),
  progression: new Set(["connected-partial", "unverified", "blocked"]),
};
const labels = {
  implementation: {implemented:"Implemented",unverified:"Unverified",blocked:"Blocked"},
  presentation: {"rendered-partial":"Rendered (partial)",unverified:"Unverified",blocked:"Blocked"},
  progression: {"connected-partial":"Connected (partial)",unverified:"Unverified",blocked:"Blocked"},
};

export function storyEventVerification(event, record = {}) {
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(allowed,key) && !["evidence","blocker"].includes(key)) throw Error(`Unknown verification field ${event.id}/${key}`);
  }
  for (const [key, values] of Object.entries(allowed)) {
    if (record[key] !== undefined && !values.has(record[key])) throw Error(`Invalid verification ${event.id}/${key}`);
  }
  const states = Object.keys(allowed).map(key=>record[key]);
  if (states.some(value=>["implemented","rendered-partial","connected-partial"].includes(value))
    && (!event.binding || !record.evidence?.trim())) throw Error(`Verification requires a binding and evidence: ${event.id}`);
  if ((states.includes("blocked") || record.blocker !== undefined) && !record.blocker?.trim()) {
    throw Error(`Blocked verification requires a scoped reason: ${event.id}`);
  }
  return {
    implementation: labels.implementation[record.implementation] || (event.binding ? "Binding recorded; not classified" : "Unmapped"),
    presentation: labels.presentation[record.presentation] || "Not classified",
    progression: labels.progression[record.progression] || "Not classified",
    evidence: record.evidence || "",
    blocker: record.blocker || "",
  };
}
