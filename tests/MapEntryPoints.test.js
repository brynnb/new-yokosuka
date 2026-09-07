import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const report = JSON.parse(
  fs.readFileSync("tools/evidence/map-entry-points.json", "utf8"),
);

test("MAPINFO player entry records retain exact destination placement", () => {
  assert.equal(report.schema, "new-yokosuka-map-entry-points-v3");
  assert.equal(report.recordLayout.size, 48);
  assert.ok(report.summary.mapCount >= 80);
  assert.ok(report.summary.entryCount >= 100);
  assert.ok(report.summary.defaultPlayerPlacementCount >= 80);
  assert.ok(report.summary.typedEntryZeroExactChrsMatchCount >= 20);
  assert.ok(report.summary.mapDirectionCount >= 80);

  const d000 = report.maps.find(
    (item) => item.scene === 1 && item.area === "D000",
  );
  assert.ok(d000);
  const entry1 = d000.entries.find((item) => item.entry === 1);
  const entry2 = d000.entries.find((item) => item.entry === 2);
  assert.deepEqual(entry1.position, [
    13.229999542236328,
    0,
    98.86000061035156,
  ]);
  assert.deepEqual(entry2.position, [
    -71.27999877929688,
    0,
    80.25,
  ]);
  assert.equal(entry1.facingDegrees, 332.010009765625);
  assert.deepEqual(entry1.browserProjection.position, [
    -13.229999542236328,
    0,
    98.86000061035156,
  ]);
  assert.equal(entry1.browserProjection.yawDegrees, -332.010009765625);
  assert.deepEqual(d000.mapDirection, {
    degrees: 0,
    nativeTurnUnits: 0,
    recordOffset: "0xd4150",
    loaderFunctionAddress: "0x0c0f26e0",
    setterFunctionAddress: "0x0c0f138a",
  });

  const mfsy = report.maps.find(
    (item) => item.scene === 2 && item.area === "MFSY",
  );
  assert.deepEqual(
    mfsy.entries.find((item) => item.entry === 2).position,
    [47.2599983215332, 0, 50],
  );
});

test("small interiors retain exact AKIR default-player placement separately", () => {
  const dcha = report.maps.find(
    (item) => item.scene === 1 && item.area === "DCHA",
  );
  assert.equal(dcha.mapDirection.degrees, 335);
  assert.equal(dcha.mapDirection.nativeTurnUnits, 60984);
  assert.deepEqual(dcha.entries, []);
  assert.deepEqual(
    {
      entry: dcha.defaultPlayerPlacement.entry,
      position: dcha.defaultPlayerPlacement.position,
      facingDegrees: dcha.defaultPlayerPlacement.facingDegrees,
      sourceKind: dcha.defaultPlayerPlacement.sourceKind,
      model: dcha.defaultPlayerPlacement.model,
    },
    {
      entry: 0,
      position: [-0.10999999940395355, 0, -2.9600000381469727],
      facingDegrees: 180,
      sourceKind: "CHRS Character AKIR",
      model: "YKB_M.MT5",
    },
  );

  const dkty = report.maps.find(
    (item) => item.scene === 1 && item.area === "DKTY",
  );
  assert.deepEqual(
    {
      position: dkty.defaultPlayerPlacement.position,
      facingDegrees: dkty.defaultPlayerPlacement.facingDegrees,
      model: dkty.defaultPlayerPlacement.model,
    },
    {
      position: [2.759999990463257, 0, -0.800000011920929],
      facingDegrees: -10,
      model: null,
    },
    "AKIR remains authoritative when the engine assembles Ryo's model",
  );
  assert.notEqual(
    dkty.defaultPlayerPlacement.recordOffset,
    "0x239e8",
    "the neighboring YKUR partial-body record must not be promoted",
  );
});
