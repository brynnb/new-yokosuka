import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const evidencePath = "tools/evidence/d000-operation-handlers.json";
const callsPath = ".disc-work/d000-dispatch-calls.json";

test("resolves Dobuita script operations through the captured native table", {
  skip: !fs.existsSync(evidencePath),
}, () => {
  const report = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(report.status, "verified");
  assert.equal(report.dispatcherAddress, "0x0c0bb69c");
  assert.equal(report.tableAddress, "0x0c29a9e0");
  const byOperation = new Map(
    report.handlers.map((handler) => [
      handler.operationHex,
      handler.handlerAddress,
    ]),
  );
  assert.equal(byOperation.get("0x00c9"), "0x0c15820a");
  assert.equal(byOperation.get("0x016b"), "0x0c1600aa");
  assert.equal(byOperation.get("0x015b"), "0x0c1600d2");
});

test("records dispatch arguments in the native handler's r6 order", {
  skip: !fs.existsSync(callsPath),
}, () => {
  const report = JSON.parse(fs.readFileSync(callsPath, "utf8"));
  assert.equal(
    report.argumentOrder,
    "native r6 memory order (first word consumed by handler first)",
  );
  const setDamy = report.calls.find(
    (call) => call.callFileOffset === "0x51ba8",
  );
  assert.equal(setDamy.operationHex, "0x00a8");
  assert.equal(setDamy.arguments[0].ascii, "DAMY");
  assert.equal(setDamy.arguments[1].value, 1);

  const selectPrizeTable = report.calls.find(
    (call) => call.callFileOffset === "0x4f9e2",
  );
  assert.equal(selectPrizeTable.operationHex, "0x019d");
  assert.equal(selectPrizeTable.arguments[0].value, 0);
  assert.equal(selectPrizeTable.arguments[1].value, 0x000abec8);
});
