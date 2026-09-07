import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/d000-door-transitions.json", "utf8"),
);

test("D000 direct storefront transitions are native selector branches", () => {
  assert.equal(report.summary.logicalDoorCount, 65);
  assert.equal(report.summary.directTransitionCount, 18);
  assert.equal(report.summary.resolvedConditionalTransitionCount, 3);
  assert.equal(report.summary.conditionalSelectorCount, 26);
  assert.equal(report.summary.noBranchSelectorCount, 21);
  assert.equal(report.summary.transitionCoroutineCallCount, 29);
  assert.equal(report.summary.resolvedTransitionSelectorCount, 21);
  assert.equal(report.summary.nativeNonTransitionSelectorCount, 44);
  assert.equal(report.summary.unresolvedTransitionSelectorCount, 0);
  assert.equal(report.summary.unresolvedInteractionSelectorCount, 44);
  assert.equal(
    report.nativeFlow.transitionCoroutineFileOffset,
    "0x7ee88",
  );
  assert.equal(
    report.nativeFlow.operation0030CallFileOffset,
    "0x7f256",
  );

  const destinations = Object.fromEntries(
    report.directTransitions.map((item) => [
      item.selector,
      `${item.destination.scene}:${item.destination.area}:`
        + `${item.destination.entry}`,
    ]),
  );
  assert.deepEqual(destinations, {
    25: "1:DKTY:0",
    27: "1:DSKI:0",
    29: "1:DTKY:0",
    30: "1:DCHA:0",
    31: "1:TATQ:0",
    32: "1:DBYO:0",
    33: "1:DJAZ:0",
    34: "1:DSBA:0",
    36: "1:DMAJ:0",
    37: "1:DPIZ:0",
    38: "1:DRME:0",
    39: "1:DSLI:0",
    40: "1:DRHT:0",
    41: "1:DSUS:0",
    42: "1:DURN:0",
    43: "1:DYKZ:0",
    44: "1:DKPA:0",
    45: "1:DSLT:0",
  });
  for (const transition of report.directTransitions) {
    assert.match(transition.sourceDoor.model, /^S1_D000_DR/);
    assert.equal(transition.sourceDoor.position.length, 3);
  }
  assert.deepEqual(report.noBranchSelectors, [
    0,
    23,
    46,
    47,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    58,
    59,
    60,
    61,
    62,
    63,
    64,
  ]);
  assert.equal(report.nativeNonTransitionSelectors.length, 44);
  assert.ok(report.nativeNonTransitionSelectors.every(
    (item) => item.classification !== "unresolvedWarp",
  ));

  const selector26 = report.conditionalTransitions.find(
    (item) => item.selector === 26,
  );
  assert.equal(selector26.sourceDoor.model, "S1_D000_DR01_011.MT5");
  assert.deepEqual(
    selector26.orderedRoutes.map((route) => (
      `${route.destination.scene}:${route.destination.area}:`
        + route.destination.entry
    )),
    [
      "1:ARAR:1",
      "1:ARAR:0",
      "1:DAZA:0",
      "1:ARAR:3",
      "1:ARAR:4",
      "1:DAZA:0",
    ],
  );
  assert.deepEqual(
    selector26.evidence.opaqueNativePredicateTargets,
    ["0x13d74", "0x13f30"],
  );
  assert.deepEqual(
    selector26.orderedRoutes[0].condition.terms.map((term) => term.flag),
    [956, 400],
  );

  const selector28 = report.conditionalTransitions.find(
    (item) => item.selector === 28,
  );
  assert.equal(selector28.whenTrue.area, "DHQB");
  assert.equal(selector28.whenFalse.area, "DBHB");
  assert.deepEqual(
    selector28.condition.terms.map((term) => term.flag),
    [70, 100],
  );

  const selector35 = report.conditionalTransitions.find(
    (item) => item.selector === 35,
  );
  assert.deepEqual(
    selector35.routes.map((route) => (
      `${route.destination.scene}:${route.destination.area}:`
        + route.destination.entry
    )),
    ["1:TOKI:10", "1:TOKI:1", "1:DRSA:0"],
  );
  assert.deepEqual(
    selector35.routes[1].condition.terms[0],
    {
      operator: "clockBetweenExclusive",
      encoding: "HHMM",
      after: 1600,
      before: 1902,
    },
  );
});
