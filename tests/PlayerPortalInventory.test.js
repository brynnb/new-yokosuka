import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(fs.readFileSync(
  new URL(
    "../tools/evidence/player-portal-inventory.json",
    import.meta.url,
  ),
));

test("player portals require both an exact source and destination placement", () => {
  assert.equal(
    report.summary.exactTransitionEdgeCount,
    report.portals.length + report.nonPortalTransitions.length,
  );
  for (const portal of report.portals) {
    assert.equal(portal.classification, "native-player-portal");
    assert.ok(portal.physicalSourceBindings.length > 0);
    assert.ok(portal.destination.entryPlacement);
  }
});

test("destination-only calls never become browser portals", () => {
  for (const transition of report.nonPortalTransitions) {
    if (transition.physicalSourceBindings.length === 0) {
      assert.notEqual(transition.classification, "native-player-portal");
    }
  }
});

test("the classification accounts for every recovered exact edge", () => {
  const classified = Object.values(
    report.summary.classificationCounts,
  ).reduce((sum, count) => sum + count, 0);
  assert.equal(classified, report.summary.exactTransitionEdgeCount);
  assert.match(report.evidenceBoundary, /never promoted/);
});

test("the browser runtime includes every currently proven native portal edge", () => {
  assert.equal(report.summary.nativePlayerPortalRuntimeEdgeCount, 44);

  const conditionalDiscOneDobuita = report.portals
    .filter((portal) => (
      portal.source.scene === 1
      && portal.source.area === "D000"
      && portal.physicalSourceBindings.some(
        ({ kind }) => kind === "d000-conditional-door-selector",
      )
    ))
    .map((portal) => ({
      selector: portal.physicalSourceBindings[0]?.source?.doorSelector,
      area: portal.destination.area,
      entry: portal.destination.entry,
    }))
    .filter(({ selector }) => [26, 28, 35].includes(selector))
    .sort((a, b) => a.selector - b.selector);

  assert.deepEqual(conditionalDiscOneDobuita, [
    { selector: 26, area: "DAZA", entry: 0 },
    { selector: 28, area: "DBHB", entry: 0 },
    { selector: 35, area: "DRSA", entry: 0 },
  ]);
});
