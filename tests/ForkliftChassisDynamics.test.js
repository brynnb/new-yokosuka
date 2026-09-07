import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceForkliftChassis,
  createForkliftChassisState,
  forkliftChassisCanDrive,
} from "../src/ForkliftChassisDynamics.js";

test("forklift chassis leans outside a sustained turn", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 12; frame++) {
    state = advanceForkliftChassis(
      state,
      { speed: 4, steeringAngle: 0.3, wheelRoll: frame * 0.2 },
      1 / 60,
    );
  }
  assert.ok(state.roll < 0);
  assert.equal(state.tipped, false);
});

test("forklift chassis pitches under abrupt acceleration", () => {
  const state = advanceForkliftChassis(
    createForkliftChassisState(),
    { speed: 1, steeringAngle: 0, wheelRoll: 0 },
    1 / 60,
  );
  assert.ok(state.pitch < 0);
});

test("pitch return tuning changes recovery but not the initial tilt", () => {
  const level = createForkliftChassisState({ previousSpeed: 0 });
  const ordinaryTilt = advanceForkliftChassis(
    level,
    { speed: 0.1 },
    1 / 60,
  );
  const fastReturnTilt = advanceForkliftChassis(
    level,
    { speed: 0.1 },
    1 / 60,
    {
      pitchReturnSpring: 28 * 25,
      pitchReturnDamping: 9 * 5,
    },
  );
  assert.equal(fastReturnTilt.pitch, ordinaryTilt.pitch);
  assert.equal(fastReturnTilt.pitchVelocity, ordinaryTilt.pitchVelocity);

  const leaned = createForkliftChassisState({
    pitch: 0.2,
    previousSpeed: 0,
  });
  const ordinaryRecovery = advanceForkliftChassis(
    leaned,
    { speed: 0 },
    1 / 60,
  );
  const fastRecovery = advanceForkliftChassis(
    leaned,
    { speed: 0 },
    1 / 60,
    {
      pitchReturnSpring: 28 * 25,
      pitchReturnDamping: 9 * 5,
    },
  );
  assert.ok(fastRecovery.pitch < ordinaryRecovery.pitch);
});

test("a raised load amplifies forward pitch while braking", () => {
  const moving = createForkliftChassisState({ previousSpeed: 4 });
  const unloaded = advanceForkliftChassis(
    moving,
    { speed: 3.7 },
    1 / 60,
  );
  const lowLoad = advanceForkliftChassis(
    moving,
    {
      speed: 3.7,
      carriedLoad: 1,
      loadHeightFraction: 0.2,
    },
    1 / 60,
  );
  const highLoad = advanceForkliftChassis(
    moving,
    {
      speed: 3.7,
      carriedLoad: 1,
      loadHeightFraction: 1,
    },
    1 / 60,
  );
  assert.ok(lowLoad.pitch > unloaded.pitch);
  assert.ok(highLoad.pitch > lowLoad.pitch);
});

test("a high raised load can tip the forklift forward under braking", () => {
  let state = createForkliftChassisState({ previousSpeed: 6 });
  for (let frame = 0; frame < 240; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: Math.max(0, 6 - frame * 0.12),
        carriedLoad: 1,
        loadHeightFraction: 1,
      },
      1 / 60,
    );
  }
  assert.equal(state.tipped, true);
  assert.equal(state.pitchTippingDirection, 1);
  assert.ok(state.pitch >= 1.2);
  assert.equal(forkliftChassisCanDrive(state), false);
});

test("a committed forward tip falls rapidly under the forklift's weight", () => {
  let state = createForkliftChassisState({
    pitch: 0.28,
    previousSpeed: 0,
  });
  for (let frame = 0; frame < 24; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 0,
        carriedLoad: 1,
        loadHeightFraction: 1,
      },
      1 / 60,
    );
  }
  assert.equal(state.tipped, true);
  assert.ok(state.pitch >= 1.2);
});

test("hard braking pitches a raised load farther than coasting", () => {
  const peakPitchForDeceleration = (deceleration) => {
    let speed = 6;
    let state = createForkliftChassisState({ previousSpeed: speed });
    let peakPitch = 0;
    while (speed > 0) {
      speed = Math.max(0, speed - deceleration / 60);
      state = advanceForkliftChassis(
        state,
        {
          speed,
          carriedLoad: 1,
          loadHeightFraction: 0.5,
        },
        1 / 60,
        { forwardTipPointOfNoReturn: 10 },
      );
      peakPitch = Math.max(peakPitch, state.pitch);
    }
    for (let frame = 0; frame < 60; frame++) {
      state = advanceForkliftChassis(
        state,
        {
          speed: 0,
          carriedLoad: 1,
          loadHeightFraction: 0.5,
        },
        1 / 60,
        { forwardTipPointOfNoReturn: 10 },
      );
      peakPitch = Math.max(peakPitch, state.pitch);
    }
    return peakPitch;
  };

  const coastingPitch = peakPitchForDeceleration(4.8);
  const hardBrakingPitch = peakPitchForDeceleration(20);
  assert.ok(hardBrakingPitch > coastingPitch);
});

test("coasting with a raised load leans farther from a higher speed", () => {
  const peakCoastingPitch = (startingSpeed) => {
    let speed = startingSpeed;
    let state = createForkliftChassisState({ previousSpeed: speed });
    let peakPitch = 0;
    while (speed > 0) {
      speed = Math.max(0, speed - 4.8 / 60);
      state = advanceForkliftChassis(
        state,
        {
          speed,
          carriedLoad: 1,
          loadHeightFraction: 1,
        },
        1 / 60,
        { forwardTipPointOfNoReturn: 10 },
      );
      peakPitch = Math.max(peakPitch, state.pitch);
    }
    return peakPitch;
  };

  const lowSpeedPitch = peakCoastingPitch(1);
  const highSpeedPitch = peakCoastingPitch(6);
  assert.ok(highSpeedPitch > lowSpeedPitch * 2);
});

test("accelerating in reverse worsens an existing forward lean", () => {
  const initial = createForkliftChassisState({
    pitch: 0.15,
    pitchVelocity: 0.2,
    previousSpeed: 0,
  });
  let reverseLoaded = initial;
  let reverseDisabled = initial;
  let speed = 0;
  for (let frame = 0; frame < 12; frame++) {
    speed -= 0.2;
    const input = {
      speed,
      carriedLoad: 1,
      loadHeightFraction: 1,
    };
    reverseLoaded = advanceForkliftChassis(
      reverseLoaded,
      input,
      1 / 60,
      { forwardTipPointOfNoReturn: 10 },
    );
    reverseDisabled = advanceForkliftChassis(
      reverseDisabled,
      input,
      1 / 60,
      {
        forwardTipPointOfNoReturn: 10,
        loadedReversePitchImpulsePerSpeedGain: 0,
      },
    );
  }
  assert.ok(reverseLoaded.pitch > initial.pitch);
  assert.ok(reverseLoaded.pitch > reverseDisabled.pitch);
});

test("full-speed reverse keeps worsening a forward lean above 15 degrees", () => {
  const initial = createForkliftChassisState({
    pitch: 16 * Math.PI / 180,
    previousSpeed: -3.6,
  });
  let reverseLoaded = initial;
  let reverseDisabled = initial;
  for (let frame = 0; frame < 30; frame++) {
    const input = {
      speed: -3.6,
      carriedLoad: 1,
      loadHeightFraction: 1,
    };
    reverseLoaded = advanceForkliftChassis(
      reverseLoaded,
      input,
      1 / 60,
      { forwardTipPointOfNoReturn: 10 },
    );
    reverseDisabled = advanceForkliftChassis(
      reverseDisabled,
      input,
      1 / 60,
      {
        forwardTipPointOfNoReturn: 10,
        loadedReversePitchAccelerationPerSpeed: 0,
      },
    );
  }
  assert.ok(reverseLoaded.pitch > initial.pitch);
  assert.ok(reverseLoaded.pitch > reverseDisabled.pitch);
});

test("a low load does not cross the forward tipping point", () => {
  let state = createForkliftChassisState({ previousSpeed: 6 });
  for (let frame = 0; frame < 120; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: Math.max(0, 6 - frame * 0.12),
        carriedLoad: 1,
        loadHeightFraction: 0.1,
      },
      1 / 60,
    );
  }
  assert.equal(state.pitchTippingDirection, 0);
  assert.equal(state.tipped, false);
});

test("an unloaded forklift keeps its existing pitch response", () => {
  const moving = createForkliftChassisState({ previousSpeed: 4 });
  const baseline = advanceForkliftChassis(
    moving,
    { speed: 3.7 },
    1 / 60,
  );
  const raisedButUnloaded = advanceForkliftChassis(
    moving,
    {
      speed: 3.7,
      carriedLoad: 0,
      loadHeightFraction: 1,
    },
    1 / 60,
  );
  assert.equal(raisedButUnloaded.pitch, baseline.pitch);
  assert.equal(
    raisedButUnloaded.pitchVelocity,
    baseline.pitchVelocity,
  );
});

test("forklift suspension reacts when the terrain contact height changes", () => {
  const state = advanceForkliftChassis(
    createForkliftChassisState(),
    {
      speed: 2,
      steeringAngle: 0,
      wheelRoll: 0,
      roadHeightDelta: 0.05,
    },
    1 / 60,
  );
  assert.ok(state.bounce < 0);
});

test("forklift tips after a sustained excessive-speed turn", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 240; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 6,
        steeringAngle: 0.55,
        steeringInput: 1,
        wheelRoll: frame * 0.2,
      },
      1 / 60,
    );
  }
  assert.equal(state.tipped, true);
  assert.ok(Math.abs(state.roll) > 1.4);
  assert.equal(forkliftChassisCanDrive(state), false);
});

test("releasing steering drops a developing tip back onto its wheels", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 35; frame++) {
    state = advanceForkliftChassis(
      state,
      { speed: 6, steeringAngle: 0.55, wheelRoll: frame * 0.2 },
      1 / 60,
    );
  }

  assert.equal(state.tipped, false);
  assert.notEqual(state.tippingDirection, 0);
  const raisedRoll = Math.abs(state.roll);

  for (let frame = 0; frame < 18; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 6,
        steeringAngle: 0,
        steeringInput: 0,
        wheelRoll: (35 + frame) * 0.2,
      },
      1 / 60,
    );
  }

  assert.equal(state.tippingDirection, 0);
  assert.equal(state.tipped, false);
  assert.ok(Math.abs(state.roll) < raisedRoll * 0.4);
  assert.equal(forkliftChassisCanDrive(state), true);
});

test("holding the steering input continues a tip after driving is gated", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 35; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 6,
        steeringAngle: 0.55,
        steeringInput: 1,
        wheelRoll: frame * 0.2,
      },
      1 / 60,
    );
  }

  assert.notEqual(state.tippingDirection, 0);
  for (let frame = 0; frame < 180; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 5,
        // The vehicle controller recenters this angle while tipping because
        // normal driving is gated, but the player is still holding the turn.
        steeringAngle: 0,
        steeringInput: 1,
        wheelRoll: (35 + frame) * 0.2,
      },
      1 / 60,
    );
  }

  assert.equal(state.tipped, true);
  assert.ok(Math.abs(state.roll) > 1.4);
});

test("releasing steering beyond 35 degrees still completes the rollover", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 40; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 6,
        steeringAngle: 0.55,
        steeringInput: 1,
        wheelRoll: frame * 0.2,
      },
      1 / 60,
    );
  }

  assert.equal(state.tipped, false);
  assert.ok(Math.abs(state.roll) >= 35 * Math.PI / 180);

  for (let frame = 0; frame < 180; frame++) {
    state = advanceForkliftChassis(
      state,
      {
        speed: 5,
        steeringAngle: 0,
        steeringInput: 0,
        wheelRoll: (40 + frame) * 0.2,
      },
      1 / 60,
    );
  }

  assert.equal(state.tipped, true);
  assert.ok(Math.abs(state.roll) > 1.4);
});

test("releasing steering does not right a forklift already on its side", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 240; frame++) {
    state = advanceForkliftChassis(
      state,
      { speed: 6, steeringAngle: 0.55, wheelRoll: frame * 0.2 },
      1 / 60,
    );
  }
  const tippedRoll = state.roll;

  for (let frame = 0; frame < 60; frame++) {
    state = advanceForkliftChassis(
      state,
      { speed: 0, steeringAngle: 0, wheelRoll: 48 },
      1 / 60,
    );
  }

  assert.equal(state.tipped, true);
  assert.equal(state.roll, tippedRoll);
  assert.equal(forkliftChassisCanDrive(state), false);
});

test("forklift does not tip during an ordinary low-speed turn", () => {
  let state = createForkliftChassisState();
  for (let frame = 0; frame < 600; frame++) {
    state = advanceForkliftChassis(
      state,
      { speed: 2.5, steeringAngle: 0.55, wheelRoll: frame * 0.1 },
      1 / 60,
    );
  }
  assert.equal(state.tipped, false);
  assert.equal(forkliftChassisCanDrive(state), true);
});
