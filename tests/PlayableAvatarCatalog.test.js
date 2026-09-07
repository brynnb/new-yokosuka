import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import nativeRoomActors from "../play/data/nativeRoomActors.js";

const catalog = JSON.parse(fs.readFileSync(
  new URL(
    "../play/data/shenmue1-playable-avatars.generated.json",
    import.meta.url,
  ),
  "utf8",
));
const nativeActivityActors = JSON.parse(fs.readFileSync(
  new URL(
    "../play/data/events/nativeActivityActors.json",
    import.meta.url,
  ),
  "utf8",
));

test("generated playable catalog excludes main and non-playable room actors", () => {
  const allModels = fs.readdirSync(new URL(
    "../play/assets/characters",
    import.meta.url,
  )).filter((filename) => filename.endsWith(".CHRM"));
  assert.equal(allModels.length, 241);
  assert.equal(catalog.avatars.length, 217);
  assert.equal(new Set(catalog.avatars.map(({ id }) => id)).size, 217);
  assert.equal(new Set(catalog.avatars.map(({ modelFile }) => modelFile)).size, 217);
  const playableModelCodes = new Set(catalog.avatars.map(({ modelCode }) => modelCode));
  for (const definition of Object.values(nativeActivityActors.worlds).flat()) {
    if (definition.activityOnly) {
      assert.equal(playableModelCodes.has(definition.modelCode), false);
    }
  }
  for (const modelCode of nativeRoomActors.modelCodes) {
    assert.equal(playableModelCodes.has(modelCode), false, modelCode);
  }
});

test("every generated playable avatar has its exact model and texture", () => {
  for (const avatar of catalog.avatars) {
    assert.equal(
      fs.existsSync(new URL(
        `../play/assets/characters/${avatar.modelFile}`,
        import.meta.url,
      )),
      true,
      avatar.modelFile,
    );
    assert.equal(
      fs.existsSync(new URL(
        `../play/assets/characters/${avatar.textureFile}`,
        import.meta.url,
      )),
      true,
      avatar.textureFile,
    );
    assert.ok(["men", "women", "kids", "animals"].includes(
      avatar.category,
    ));
  }
});

test("native controller families retain the expected playable categories", () => {
  const counts = Object.groupBy(catalog.avatars, ({ category }) => category);
  assert.deepEqual(Object.fromEntries(
    Object.entries(counts).map(([category, avatars]) => (
      [category, avatars.length]
    )),
  ), {
    women: 50,
    men: 148,
    animals: 5,
    kids: 14,
  });
  assert.deepEqual(catalog.avatars.filter(
    ({ allowPartialRenderRoutes }) => allowPartialRenderRoutes,
  ).map(({ modelCode }) => modelCode), ["TKI_L", "HOB_L"]);
  assert.deepEqual(catalog.avatars.filter(
    ({ selectable }) => selectable === false,
  ).map(({ modelCode }) => modelCode), ["TKI_L", "HOB_L"]);
});
