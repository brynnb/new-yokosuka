import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import catalog from "../artwork/inventory/catalog.json" with { type: "json" };
import { INVENTORY_ITEMS } from "../play/ui/react/inventoryItems.js";

test("inventory display assets exist and unused artwork stays separate", async () => {
  assert.equal(new Set(catalog.assets.map((item) => item.id)).size, catalog.assets.length);
  assert.deepEqual(INVENTORY_ITEMS.map((item) => item.id),
    catalog.assets.filter((item) => item.usage === "display").map((item) => item.id));
  assert.ok(!INVENTORY_ITEMS.some((item) => item.id === "h214-key" || item.id === "demo-notebook"));
  let displayBytes = 0;
  for (const item of catalog.assets) {
    const file = new URL(`../${item.file}`, import.meta.url);
    const bytes = await readFile(file);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", item.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", item.id);
    assert.equal((await stat(file)).size, item.bytes, item.id);
    if (item.usage === "display") {
      assert.deepEqual([item.width, item.height], [256, 256]);
      assert.equal(INVENTORY_ITEMS.find((entry) => entry.id === item.id).iconUrl, file.href);
      displayBytes += bytes.length;
    } else {
      assert.match(item.file, /^artwork\/inventory\/reserve\//);
    }
  }
  assert.ok(displayBytes < 1024 * 1024, "All displayed icons should total less than 1 MiB");
});

test("Vite emits the active icon files without reserve artwork", async () => {
  const { build } = await import("vite");
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        input: new URL("../play/ui/react/inventoryItems.js", import.meta.url).pathname,
        preserveEntrySignatures: "strict",
      },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
  const images = output.filter((entry) => entry.type === "asset" && entry.fileName.endsWith(".webp"));
  assert.equal(images.length, INVENTORY_ITEMS.length);
  for (const item of INVENTORY_ITEMS) {
    assert.ok(images.some((asset) => asset.fileName.startsWith(`assets/${item.id}-`)), item.id);
  }
});
