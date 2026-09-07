import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const audit = JSON.parse(
  readFileSync(
    new URL("../src/data/collection-model-names.json", import.meta.url),
    "utf8",
  ),
);

test("collection model audit covers every GAC model in the catalog", () => {
  const models = JSON.parse(
    readFileSync(new URL("../public/models.json", import.meta.url), "utf8"),
  );
  const gacModels = models.filter((filename) => filename.startsWith("G_ITEM_GAC"));

  assert.equal(audit.schema, "shenmue-collection-model-names-v2");
  for (const filename of gacModels) {
    assert.ok(audit.items[filename], `${filename} is missing from the audit`);
  }
});

test("collection model names preserve the executable's authoritative mappings", () => {
  assert.equal(
    audit.items["G_ITEM_GACIAK1G.MT5"].displayName,
    "Akira 1",
  );
  assert.equal(
    audit.items["G_ITEM_GACRSSCG.MT5"].displayName,
    "Super Sonic",
  );
  assert.equal(
    audit.items["G_ITEM_GACS5N1G.MT5"].displayName,
    "Forklift No.1",
  );
  assert.equal(audit.counts.collectionTableNames, 167);
});

test("alternate-size models retain counterpart names for research", () => {
  assert.equal(
    audit.items["G_ITEM_GACIAA1G.MT5"].displayName,
    "Akira 1 (Alternate)",
  );
  assert.equal(
    audit.items["G_ITEM_GACIAA2G.MT5"].displayName,
    "Akira 2 (Alternate)",
  );
  assert.equal(
    audit.items["G_ITEM_GACOKK9G.MT5"].displayName,
    "Coupe'5 (Alternate)",
  );
  assert.equal(
    audit.items["G_ITEM_GACK6XOG.MT5"].displayName,
    "Hang On 1 (Alternate)",
  );
  assert.equal(
    audit.items["G_ITEM_GACIAA1G.MT5"].status,
    "alternate-size-model",
  );
  assert.equal(audit.counts.alternateSizeModels, 34);
  assert.equal(audit.counts.uncataloguedGacAssets, 0);
});

test("collection models include non-GAC records and distinguish cross-references", () => {
  assert.equal(
    audit.items["G_ITEM_KAB02FSG.MT5"].displayName,
    "Delivery Moped",
  );
  assert.equal(
    audit.items["G_ITEM_SPBK6REG.MT5"].displayName,
    "Super Ball 1",
  );
  assert.equal(
    audit.items["G_ITEM_GACK6SPG.MT5"].displayName,
    "Space Harrier",
  );
  assert.equal(
    audit.items["G_ITEM_GACK6SPG.MT5"].status,
    "cross-referenced",
  );
});
