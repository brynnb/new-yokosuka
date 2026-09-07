import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/map-event-callbacks.json", "utf8"),
);

function map(disc, area) {
  return report.maps.find(
    (item) => item.disc === disc && item.area === area,
  );
}

test("recovers structurally unique callback tables on every source disc", () => {
  assert.equal(report.schema, "new-yokosuka-map-event-callbacks-v1");
  assert.equal(report.summary.mapCount, 9);
  for (const disc of [1, 2, 3]) {
    assert.equal(map(disc, "D000").callbacks.length, 6);
    assert.equal(map(disc, "JD00").callbacks.length, 4);
    assert.equal(map(disc, "JU00").callbacks.length, 2);
  }
});

test("D000 callback IDs 2 and 3 are the two native JD00 routes", () => {
  for (const disc of [1, 2, 3]) {
    const callbacks = map(disc, "D000").callbacks;
    assert.equal(callbacks[0].empty, true);
    assert.equal(callbacks[1].empty, true);
    assert.deepEqual(
      callbacks[2].transitionRoutes.map((route) => route.destination.area),
      ["JD00"],
    );
    assert.deepEqual(
      callbacks[3].transitionRoutes.map((route) => route.destination.area),
      ["JD00"],
    );
  }
});

test("JU00 event 1 routes back to JD00 through its native helper", () => {
  for (const disc of [1, 2, 3]) {
    const callbacks = map(disc, "JU00").callbacks;
    assert.equal(callbacks[0].empty, true);
    assert.ok(
      callbacks[1].transitionRoutes.some(
        (route) => route.destination.area === "JD00",
      ),
    );
  }
});

test("JD00 event callbacks share one exact selector byte", () => {
  for (const disc of [1, 2, 3]) {
    const callbacks = map(disc, "JD00").callbacks.slice(1);
    const offsets = new Set(
      callbacks.map(
        (callback) => callback.selectorWrite.scn3RelativeOffset,
      ),
    );
    assert.equal(offsets.size, 1);
    assert.deepEqual(
      callbacks.map((callback) => callback.selectorWrite.value),
      [3, 1, 2],
    );
    const routes = map(disc, "JD00").selectorDispatch.routes;
    assert.deepEqual(
      routes.map((route) => [
        route.selectorValue,
        route.destination.area,
        route.destination.entry,
      ]),
      [
        [3, "JU00", 0],
        [1, "D000", 1],
        [2, "D000", 11],
      ],
    );
    assert.deepEqual(
      routes.map((route) => route.destination.scene),
      [disc, disc, disc],
    );
  }
});
