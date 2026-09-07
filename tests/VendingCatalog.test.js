import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  VENDING_MANIFEST,
  VENDING_PRODUCTS,
  isVendingMachineModel,
  vendingMachineForPlacement,
  vendingProduct,
} from "../src/VendingCatalog.js";

test("the browser uses the generated Shenmue vending manifest", () => {
  assert.equal(VENDING_MANIFEST.unitPrice, 100);
  assert.deepEqual(VENDING_MANIFEST.winningCanChance, {
    numerator: 1,
    denominator: 10,
  });
  assert.deepEqual(
    VENDING_PRODUCTS.map(({ key, name, resourceCode }) => ({
      key,
      name,
      resourceCode,
    })),
    [
      { key: "jet_cola", name: "Jet Cola", resourceCode: "COKE" },
      {
        key: "fruda_orange",
        name: "Fruda Orange",
        resourceCode: "FATO",
      },
      {
        key: "fruda_grape",
        name: "Fruda Grape",
        resourceCode: "FATG",
      },
      { key: "jet_soda", name: "Jet Soda", resourceCode: "SPRT" },
      {
        key: "bell_woods_coffee",
        name: "Bell Wood's Coffee Original Blend",
        resourceCode: "CAFE",
      },
    ],
  );
  assert.equal(VENDING_MANIFEST.prize.resourceCode, "ATRK");
  assert.equal(vendingProduct("not-a-drink"), null);
});

test("every authored vending-machine placement has a stable server identity", () => {
  assert.equal(VENDING_MANIFEST.machines.length, 14);
  const ids = new Set(VENDING_MANIFEST.machines.map(({ id }) => id));
  assert.equal(ids.size, VENDING_MANIFEST.machines.length);
  for (const machine of VENDING_MANIFEST.machines) {
    assert.deepEqual(
      vendingMachineForPlacement(machine.worldId, {
        model: machine.model,
        position: machine.position,
      }),
      machine,
    );
  }
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(VENDING_MANIFEST.machines.map(({ worldId }) => worldId))]
        .map((worldId) => [
          worldId,
          VENDING_MANIFEST.machines.filter(
            (machine) => machine.worldId === worldId,
          ).length,
        ]),
    ),
    { sakuragaoka: 1, dobuita: 5, mfsy: 2, ma00: 2, ma00race: 4 },
  );
});

test("the forklift playground registers its reused Harbor machines", () => {
  const harborPlacements = JSON.parse(
    fs.readFileSync("play/data/mfsy-runtime-placements.json", "utf8"),
  ).placements.filter(({ model }) => isVendingMachineModel(model));
  assert.equal(harborPlacements.length, 2);
  for (const placement of harborPlacements) {
    assert.equal(
      vendingMachineForPlacement("ma00", placement)?.worldId,
      "ma00",
    );
  }
});
