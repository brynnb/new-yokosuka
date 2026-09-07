import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const inventory = JSON.parse(fs.readFileSync(
  "tools/evidence/native-activity-owner-candidates.json",
));
const routes = JSON.parse(fs.readFileSync("tools/data/native-event-program-routes.json"));
const programs = JSON.parse(fs.readFileSync(
  "play/data/events/nativeEventPrograms.generated.json",
));

test("native activity owner candidates retain exact static installer scope", () => {
  assert.equal(
    inventory.summary.exactAuthSelectionCount
      + inventory.summary.unresolvedAuthSelectionCount,
    inventory.summary.staticInstallCount,
  );
  assert.ok(inventory.summary.installerFunctionCount > 0);
  assert.ok(inventory.candidates.every(candidate => (
    candidate.installs.length > 0
    && candidate.installs.every(install => (
      Number.isInteger(install.slot)
      && Number.isInteger(install.primaryPointer)
      && Number.isInteger(install.secondaryPointer)
    ))
  )));
});

test("owner review routes are a strict subset of canonical compiled programs", () => {
  const routeIds = new Set(routes.routes.map(route => route.id));
  const canonicalOwnerPrograms = programs.programs.filter(program => !program.preview);
  const programsOutsideRoutes = canonicalOwnerPrograms
    .map(program => program.id)
    .filter(id => !routeIds.has(id))
    .sort();
  assert.equal(
    inventory.sourceAlignment.compiledProgramCount,
    canonicalOwnerPrograms.length,
  );
  assert.equal(
    inventory.sourceAlignment.activityOwnerRouteCount,
    routes.routes.length,
  );
  assert.deepEqual(
    inventory.sourceAlignment.programsOutsideActivityOwnerRoutes,
    programsOutsideRoutes,
  );
});

test("reviewed wrapper closures identify their shared activity installers", () => {
  const expected = new Map([
    ["d1:D000:installer:0x5a900", ["disc1-d000-yamagishi-owner-0x5b904"]],
    ["d1:D000:installer:0x7a714", ["disc1-d000-entry-0x7abf4"]],
    ["d1:D000:installer:0x7b7d8", ["disc1-d000-entry-0x7abf4"]],
    ["d1:D000:installer:0x858c4", ["disc1-d000-selector-18-0x84b60"]],
    ["d1:D000:installer:0x8b630", [
      "disc1-d000-vending-owner-a-0x8c768",
      "disc1-d000-vending-owner-b-0x8ce38",
    ]],
  ]);
  for (const [id, route] of expected) {
    assert.deepEqual(
      inventory.candidates.find(candidate => candidate.id === id)
        ?.reviewedRouteIds,
      route,
    );
  }
});

test("DNOZ is promoted only through its explicitly reviewed owner route", () => {
  const dnoz = inventory.candidates.find(
    candidate => candidate.id === "d1:JD00:installer:0x5c958",
  );
  assert.deepEqual(
    dnoz.reviewedRouteIds,
    ["disc1-jd00-nozomi-tears-owner-0x5c958"],
  );
  assert.equal(dnoz.promotionState, "reviewed-route");
  assert.ok(!dnoz.blockers.includes("player-facing-lifecycle-owner-unreviewed"));
  assert.deepEqual(dnoz.resourceNames, ["DNOZ"]);
  assert.deepEqual(dnoz.actorTags, ["AKIR", "HRSK"]);
  assert.ok(dnoz.installs.every(install => install.authResources.length === 1));
});

test("reviewed ambient activity owners remain explicitly outside cutscene promotion", () => {
  const jdya = inventory.candidates.find(
    candidate => candidate.id === "d1:JD00:installer:0x59448",
  );
  assert.equal(jdya.promotionState, "reviewed-non-cutscene");
  assert.equal(jdya.reviewedDisposition.classification, "ambient-world-state");
  assert.equal(jdya.reviewedDisposition.reviewedOwnerFunction, "0x58c34");
  assert.ok(!jdya.blockers.includes("player-facing-lifecycle-owner-unreviewed"));
});
