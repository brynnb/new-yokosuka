import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidenceUrl = new URL(
  "../tools/evidence/dialogue-predicate-values.json",
  import.meta.url,
);

test("native dialogue predicate value families remain exact", async () => {
  const report = JSON.parse(await readFile(evidenceUrl, "utf8"));
  assert.equal(report.corpus.resourceCount, 262);
  assert.equal(report.corpus.uniqueExpressionCount, 254);
  assert.equal(report.nativeOperators["9"], "greaterThan");
  assert.equal(report.nativeOperators["12"], "lessThanOrEqual");

  const bank2 = report.nativeValueTypes.find(
    (item) => item.encodedGroup === "0x00",
  );
  assert.equal(bank2.capacity, 1024);
  assert.equal(bank2.operation0051ReadSuboperation, 11);
  assert.deepEqual(
    report.nativeStateBanks.banks.map((bank) => ({
      bank: bank.bank,
      runtimeAddress: bank.runtimeAddress,
      byteLength: bank.byteLength,
      saveOffset: bank.saveOffset,
    })),
    [
      {
        bank: 2,
        runtimeAddress: "0xc223ef8",
        byteLength: 128,
        saveOffset: 0x130,
      },
      {
        bank: 3,
        runtimeAddress: "0xc223ef0",
        byteLength: 8,
        saveOffset: 0x128,
      },
      {
        bank: 4,
        runtimeAddress: "0xc223f78",
        byteLength: 32,
        saveOffset: 0x230,
      },
    ],
  );
  assert.equal(report.nativeStateBanks.defaultState, "all bytes zero");

  const runtime = report.nativeValueTypes.find(
    (item) => item.encodedGroup === "0xa0",
  );
  assert.equal(runtime.modes["0"], "year since 1900");
  assert.equal(
    runtime.modes["3"],
    "weekday, Sunday 0 through Saturday 6",
  );
  assert.equal(report.nativeCalendar.runtimeAddress, "0xc225228");
  assert.equal(report.nativeCalendar.yearBase, 1900);

  assert.equal(report.nativeSpatialTable.runtimeAddress, "0xc2791c0");
  assert.equal(report.nativeSpatialTable.recordCount, 13);
  assert.deepEqual(report.nativeSpatialTable.records[0], {
    index: 1,
    mapIdentity: "D000",
    runtimePosition: [6, 0, 84],
    browserPosition: [-6, 0, 84],
    radiusSquared: 225,
    radius: 15,
  });
  assert.equal(report.nativeSpatialTable.records[10].mapIdentity, "MFSY");
});
