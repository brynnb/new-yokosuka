import test from "node:test";
import assert from "node:assert/strict";
import { EmoteController } from "../play/characters/EmoteController.js";

test("emote controller synchronizes animation and picker UI", () => {
  const animation = {
    activeEmote: null,
    playEmote(emote) {
      this.activeEmote = { emote };
      return true;
    },
    clearEmote() { this.activeEmote = null; },
  };
  let activeEmoteId = null;
  let closed = false;
  const controller = new EmoteController({
    animation,
    closeMenu: () => { closed = true; },
    setActiveEmote: (emoteId) => { activeEmoteId = emoteId; },
  });

  assert.equal(controller.play({ id: "bow", label: "Bow" }), true);
  assert.equal(activeEmoteId, "bow");
  assert.equal(closed, true);
  controller.clear();
  assert.equal(controller.active, null);
});
