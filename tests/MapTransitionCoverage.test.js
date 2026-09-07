import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync(
    "tools/evidence/map-transition-coverage.json",
    "utf8",
  ),
);

test("whole-disc transition coverage keeps destinations and triggers separate", () => {
  assert.equal(report.summary.mapInfoCount, 136);
  assert.equal(report.summary.exactDestinationEdgeCount, 292);
  assert.equal(
    report.summary.exactDestinationEdgeWithEntryPlacementCount,
    208,
  );
  assert.equal(report.summary.exactPhysicalSourceBindingCount, 124);
  assert.equal(report.summary.exactEdgeWithPhysicalSourceBindingCount, 123);
  assert.equal(report.summary.destinationOnlyEdgeCount, 169);
  assert.equal(report.summary.dynamicTransitionCallCount, 20);
  assert.equal(report.summary.dynamicSharedHelperCount, 14);
  assert.equal(report.summary.trueRuntimeDestinationCallCount, 6);
});

test("physical sources are never assigned by proximity", () => {
  for (const edge of report.edges) {
    assert.ok([
      "exact",
      "destination-only; physical dispatcher unbound",
    ].includes(edge.physicalSourceStatus));
    for (const binding of edge.physicalSourceBindings) {
      assert.ok([
        "native-event-volume",
        "typed-door-controller",
        "d000-door-selector",
        "d000-conditional-door-selector",
      ].includes(binding.kind));
    }
  }

  const ajiichi = report.edges.find((edge) => (
    edge.source.scene === 1
    && edge.source.area === "D000"
    && edge.destination.area === "DCHA"
    && edge.destination.entry === 0
  ));
  assert.ok(ajiichi);
  assert.ok(ajiichi.physicalSourceBindings.some(
    (binding) => (
      binding.kind === "d000-door-selector"
      && binding.source.doorSelector === 30
    ),
  ));
});
