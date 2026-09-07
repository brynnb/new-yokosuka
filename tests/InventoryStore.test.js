import assert from "node:assert/strict";
import test from "node:test";

import {
  closeInventory,
  configureInventoryUi,
  openInventory,
  useInventoryStore,
} from "../play/ui/react/inventoryStore.js";

test("inventory placeholder opens and closes with lifecycle callbacks", () => {
  const events = [];
  configureInventoryUi({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
  });
  useInventoryStore.setState({ open: false });

  openInventory();
  openInventory();
  assert.equal(useInventoryStore.getState().open, true);
  closeInventory();
  closeInventory();
  assert.equal(useInventoryStore.getState().open, false);
  assert.deepEqual(events, ["open", "close"]);
});
