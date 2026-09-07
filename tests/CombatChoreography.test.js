import assert from "node:assert/strict";
import test from "node:test";
import {
  COMBAT_PAIR_CHOREOGRAPHY,
  combatLocalToWorld,
  positionAuthoredCombatPair,
} from "../play/combat/CombatChoreography.js";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
} from "../src/MartialArtsCombat.js";

function participant(x, z, yaw, sample) {
  return {
    x,
    z,
    angle: yaw,
    sample,
    shared: false,
    position() {
      return { x: this.x, z: this.z };
    },
    yaw() {
      return this.angle;
    },
    activeOneShotChoreographySample() {
      return this.sample;
    },
    setCombatPosition(nextX, nextZ, nextYaw) {
      this.x = nextX;
      this.z = nextZ;
      this.angle = nextYaw;
    },
    setSharedPair(active) {
      this.shared = Boolean(active);
    },
  };
}

test("every synchronized native pair has an authored choreography record", () => {
  const synchronized = [
    ...Object.values(MARTIAL_ARTS_MOVES),
    ...Object.values(MARTIAL_ARTS_FOLLOWUP_STAGES),
  ].filter((definition) => definition.synchronizedVictim);
  assert.deepEqual(
    synchronized
      .map(({ id }) => id)
      .filter((id) => !COMBAT_PAIR_CHOREOGRAPHY[id]),
    [],
  );
});

test("frame-zero roots position a mixed pose/travel pair around the attacker", () => {
  const attacker = participant(10, 20, Math.PI / 2, {
    kind: "pose",
    authoredTranslation: [0.5, 1.1, -0.25],
    embeddedTranslation: [0.5, 1.1, -0.25],
  });
  const defender = participant(4, 7, -1, {
    kind: "travel",
    authoredTranslation: [0, 0, -1.25],
    embeddedTranslation: [0, 0, 0],
  });

  const result = positionAuthoredCombatPair(
    attacker,
    defender,
    "overthrow",
    { anchor: { x: 10, z: 20 } },
  );

  // The pose-root offset is counter-shifted in the actor container, keeping
  // the attacker's rendered root on the supplied world anchor.
  assert.ok(Math.abs(attacker.x - 9.75) < 1e-12);
  assert.ok(Math.abs(attacker.z - 20.5) < 1e-12);
  // Victim frame zero is one native unit forward and half a unit left of the
  // attacker after converting the authored X/Z delta at a right-facing yaw.
  assert.ok(Math.abs(defender.x - 11) < 1e-12);
  assert.ok(Math.abs(defender.z - 20.5) < 1e-12);
  assert.equal(attacker.angle, Math.PI / 2);
  assert.equal(defender.angle, Math.PI / 2);
  assert.equal(attacker.shared, true);
  assert.equal(defender.shared, true);
  assert.ok(Math.abs(result.authoredDistance - Math.hypot(1, 0.5)) < 1e-12);
});

test("two pose-root clips retain a common container origin", () => {
  const attacker = participant(3, 5, 0, {
    kind: "pose",
    authoredTranslation: [0, 1.1, 0],
    embeddedTranslation: [0, 1.1, 0],
  });
  const defender = participant(9, 9, 0, {
    kind: "pose",
    authoredTranslation: [0, 1.06, -0.92236328125],
    embeddedTranslation: [0, 1.06, -0.92236328125],
  });
  positionAuthoredCombatPair(attacker, defender, "shoulderBuster");
  assert.deepEqual(
    { attacker: [attacker.x, attacker.z], defender: [defender.x, defender.z] },
    { attacker: [3, 5], defender: [3, 5] },
  );
});

test("native -Z maps to fighter-forward at every yaw", () => {
  assert.deepEqual(combatLocalToWorld(0, -1, 0), { x: 0, z: 1 });
  const rightFacing = combatLocalToWorld(0, -1, Math.PI / 2);
  assert.ok(Math.abs(rightFacing.x - 1) < 1e-12);
  assert.ok(Math.abs(rightFacing.z) < 1e-12);
});
