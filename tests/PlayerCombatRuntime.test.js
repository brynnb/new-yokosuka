import assert from "node:assert/strict";
import test from "node:test";

import {
  combatPlayerAnimationState,
} from "../play/characters/PlayerCombatRuntime.js";

const movement = (overrides = {}) => ({
  moving: false,
  turning: false,
  combatDirection: null,
  ...overrides,
});

test("free-roam movement remains owned by the player animation runtime", () => {
  assert.equal(combatPlayerAnimationState(null, movement()), null);
  assert.equal(combatPlayerAnimationState({ controlsActive: false }, movement()), null);
});

test("combat movement selects guard, stance, and target-relative locomotion", () => {
  const encounter = {
    controlsActive: true,
    player: { guardHeld: true },
  };
  assert.equal(
    combatPlayerAnimationState(encounter, movement({ moving: true })),
    "combatGuard",
  );

  encounter.player.guardHeld = false;
  assert.equal(combatPlayerAnimationState(encounter, movement()), "combatStance");
  assert.equal(
    combatPlayerAnimationState(
      encounter,
      movement({ moving: true, combatDirection: "left" }),
    ),
    "combatStrafeLeft",
  );
  assert.equal(
    combatPlayerAnimationState(
      encounter,
      movement({ moving: true, combatDirection: "forward" }),
    ),
    "combatAdvance",
  );
});
