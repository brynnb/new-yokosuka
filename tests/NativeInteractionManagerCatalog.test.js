import assert from "node:assert/strict";
import test from "node:test";

import pack from "../play/data/events/nativeInteractionManagers.generated.json" with {
  type: "json",
};
import {
  createNativeInteractionManagerCatalog,
} from "../play/events/NativeInteractionManagerCatalog.js";

test("generated native interaction-manager pack has exact corpus totals", () => {
  const catalog = createNativeInteractionManagerCatalog(pack);
  assert.deepEqual(catalog.summary, {
    managerCount: 96,
    descriptorCount: 517,
    indirectReferenceCount: 850,
  });
  assert.equal(catalog.list().length, 96);
  assert.equal(catalog.getBySource({
    disc: 1,
    area: "d000",
    mapinfoSha256: "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e",
  })?.descriptorSequences.length, 65);
  assert.equal(catalog.getBySource({
    disc: 2,
    area: "D000",
    mapinfoSha256: "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e",
  }), null);
});
