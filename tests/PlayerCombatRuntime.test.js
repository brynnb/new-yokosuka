import assert from "node:assert/strict";
import test from "node:test";
import { createCombatant } from "../src/MartialArtsCombat.js";

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
    player: { ...createCombatant({ id: "ryo" }), guardHeld: true },
  };
  assert.equal(
    combatPlayerAnimationState(encounter, movement({ moving: true })),
    "combatGuard",
  );

  // Held intent survives recovery, but must not display a guard during an
  // attack or knockdown. It becomes visible as soon as recovery completes.
  encounter.player.action = { moveId: "crescentKick" };
  assert.equal(combatPlayerAnimationState(encounter, movement()), "combatStance");
  encounter.player.action = null;
  encounter.player.knockdown = 1;
  assert.equal(combatPlayerAnimationState(encounter, movement()), "combatStance");
  encounter.player.knockdown = 0;
  assert.equal(combatPlayerAnimationState(encounter, movement()), "combatGuard");

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
