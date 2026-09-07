const DEFAULT_OPTIONS = Object.freeze({
    wheelbase: 1.3,
    maximumLean: 0.3,
    rollPerLateralAcceleration: 0.025,
    pitchPerLongitudinalAcceleration: 0.006,
    maximumPitch: 0.04,
    loadedBrakingPitchMultiplier: 7.59375,
    loadedMaximumForwardPitch: 0.309375,
    loadedBrakingPitchImpulsePerSpeedLoss: 0.3584,
    loadedBrakingPitchSpeedReference: 6,
    loadedCoastingAccelerationThreshold: 6,
    loadedReversePitchImpulsePerSpeedGain: 0.3584,
    loadedReversePitchAccelerationPerSpeed: 2.6,
    loadedReversePitchAccelerationStart: 15 * Math.PI / 180,
    forwardTipPointOfNoReturn: 0.27,
    // Once the center of mass passes the front axle, the loaded chassis is no
    // longer riding its suspension spring: it drops under its full weight.
    forwardTipAngularAcceleration: 14,
    forwardTipAngularDamping: 0.35,
    forwardTipMinimumAngularVelocity: 0.8,
    forwardRestingTipAngle: 1.25,
    rollSpring: 24,
    rollDamping: 8,
    rollReturnSpring: 52,
    rollReturnDamping: 9,
    pitchSpring: 28,
    pitchDamping: 9,
    pitchReturnSpring: 28,
    pitchReturnDamping: 9,
    bounceSpring: 42,
    bounceDamping: 10,
    maximumBounce: 0.022,
    tipLateralAcceleration: 12,
    tipDelay: 0.32,
    steeringReleaseThreshold: 0.05,
    tipPointOfNoReturn: 35 * Math.PI / 180,
    tipAngularAcceleration: 5.4,
    tipAngularDamping: 0.55,
    restingTipAngle: 1.5,
});

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function springStep(
    value,
    velocity,
    target,
    stiffness,
    damping,
    deltaSeconds,
) {
    const acceleration = (
        (target - value) * stiffness
        - velocity * damping
    );
    const nextVelocity = velocity + acceleration * deltaSeconds;
    return {
        value: value + nextVelocity * deltaSeconds,
        velocity: nextVelocity,
    };
}

export function createForkliftChassisState(overrides = {}) {
    return {
        pitch: 0,
        roll: 0,
        bounce: 0,
        pitchVelocity: 0,
        rollVelocity: 0,
        bounceVelocity: 0,
        tipTimer: 0,
        tippingDirection: 0,
        pitchTippingDirection: 0,
        tipped: false,
        previousSpeed: 0,
        ...overrides,
    };
}

export function advanceForkliftChassis(
    state,
    {
        speed = 0,
        steeringAngle = 0,
        steeringInput = null,
        wheelRoll = 0,
        roadHeightDelta = 0,
        carriedLoad = 0,
        loadHeightFraction = 0,
    } = {},
    deltaSeconds,
    options = {},
) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    if (dt <= 0) return createForkliftChassisState(state);

    const longitudinalAcceleration = (
        (speed - state.previousSpeed) / dt
    );
    const lateralAcceleration = (
        speed * Math.abs(speed)
        / config.wheelbase
        * Math.tan(steeringAngle)
    );
    const steeringReleased = Number.isFinite(steeringInput)
        ? Math.abs(steeringInput) <= config.steeringReleaseThreshold
        : Math.abs(steeringAngle) <= config.steeringReleaseThreshold;
    let tipTimer = Math.abs(lateralAcceleration)
        >= config.tipLateralAcceleration
        ? state.tipTimer + dt
        : Math.max(0, state.tipTimer - dt * 2);
    let tippingDirection = state.tippingDirection;
    if (
        !state.tipped
        && tippingDirection !== 0
        && steeringReleased
        && Math.abs(state.roll) < config.tipPointOfNoReturn
    ) {
        // Before the center of mass crosses the balance point, releasing the
        // turn lets gravity pull the raised wheels sharply back to the ground.
        tippingDirection = 0;
        tipTimer = 0;
    }
    if (
        !state.tipped
        && tippingDirection === 0
        && tipTimer >= config.tipDelay
    ) {
        // The chassis falls toward the outside of the turn.
        tippingDirection = -Math.sign(lateralAcceleration || steeringAngle);
    }

    const loadLeverage = (
        clamp(Number(carriedLoad) || 0, 0, 1)
        * clamp(Number(loadHeightFraction) || 0, 0, 1)
    );
    const brakingForwardWithRaisedLoad = (
        state.previousSpeed > 0
        && longitudinalAcceleration < 0
    );
    const brakingSpeedFactor = brakingForwardWithRaisedLoad
        ? (
            Math.abs(longitudinalAcceleration)
                <= config.loadedCoastingAccelerationThreshold
                ? clamp(
                    state.previousSpeed
                        / config.loadedBrakingPitchSpeedReference,
                    0,
                    1,
                )
                : 1
        )
        : 0;
    const effectiveBrakingLoadLeverage = loadLeverage * brakingSpeedFactor;
    const pitchMultiplier = brakingForwardWithRaisedLoad
        ? 1
            + effectiveBrakingLoadLeverage
                * config.loadedBrakingPitchMultiplier
        : 1;
    const maximumForwardPitch = (
        config.maximumPitch
        + effectiveBrakingLoadLeverage * (
            config.loadedMaximumForwardPitch - config.maximumPitch
        )
    );
    const targetPitch = clamp(
        -longitudinalAcceleration
            * config.pitchPerLongitudinalAcceleration
            * pitchMultiplier,
        -config.maximumPitch,
        brakingForwardWithRaisedLoad
            ? maximumForwardPitch
            : config.maximumPitch,
    );
    const brakingSpeedLoss = brakingForwardWithRaisedLoad
        ? Math.max(0, state.previousSpeed - Math.max(0, speed))
        : 0;
    const reverseSpeedGain = (
        speed < 0
        && longitudinalAcceleration < 0
    )
        ? Math.max(
            0,
            Math.abs(speed) - Math.abs(Math.min(0, state.previousSpeed)),
        )
        : 0;
    const loadedBrakingPitchImpulse = (
        brakingSpeedLoss
        * loadLeverage
        * config.loadedBrakingPitchImpulsePerSpeedLoss
    );
    const loadedReversePitchImpulse = (
        reverseSpeedGain
        * loadLeverage
        * config.loadedReversePitchImpulsePerSpeedGain
    );
    const sustainedReversePitchAcceleration = (
        speed < 0
        && state.pitch >= config.loadedReversePitchAccelerationStart
    )
        ? Math.abs(speed)
            * loadLeverage
            * config.loadedReversePitchAccelerationPerSpeed
        : 0;
    let tipped = state.tipped;
    let pitchTippingDirection = state.pitchTippingDirection || 0;
    if (
        !tipped
        && pitchTippingDirection === 0
        && loadLeverage > 0
        && state.pitch >= config.forwardTipPointOfNoReturn
    ) {
        pitchTippingDirection = 1;
    }
    let pitch;
    let pitchVelocity;
    if (pitchTippingDirection !== 0) {
        const committedPitchVelocity = Math.max(
            state.pitchVelocity,
            config.forwardTipMinimumAngularVelocity,
        );
        pitchVelocity = (
            committedPitchVelocity
            + pitchTippingDirection
                * config.forwardTipAngularAcceleration
                * dt
        ) * Math.exp(-config.forwardTipAngularDamping * dt);
        pitch = state.pitch + pitchVelocity * dt;
        if (pitch >= config.forwardRestingTipAngle) {
            pitch = config.forwardRestingTipAngle;
            pitchVelocity = 0;
            tipped = true;
        }
    } else {
        const pitchReturningToGround = (
            Math.abs(state.pitch) > 0.005
            && (
                Math.abs(targetPitch) < Math.abs(state.pitch)
                || Math.sign(targetPitch) !== Math.sign(state.pitch)
            )
        );
        const recoveryTarget = (
            pitchReturningToGround
            && Math.sign(targetPitch) !== Math.sign(state.pitch)
        )
            ? 0
            : targetPitch;
        const pitchStep = springStep(
            state.pitch,
            state.pitchVelocity
                + loadedBrakingPitchImpulse
                + loadedReversePitchImpulse
                + sustainedReversePitchAcceleration * dt,
            tipped ? 0 : recoveryTarget,
            pitchReturningToGround
                ? config.pitchReturnSpring
                : config.pitchSpring,
            pitchReturningToGround
                ? config.pitchReturnDamping
                : config.pitchDamping,
            dt,
        );
        pitch = pitchStep.value;
        pitchVelocity = pitchStep.velocity;
    }

    let roll;
    let rollVelocity;
    if (tippingDirection !== 0) {
        rollVelocity = (
            state.rollVelocity
            + tippingDirection * config.tipAngularAcceleration * dt
        ) * Math.exp(-config.tipAngularDamping * dt);
        roll = state.roll + rollVelocity * dt;
        if (Math.abs(roll) >= config.restingTipAngle) {
            roll = tippingDirection * config.restingTipAngle;
            rollVelocity = 0;
            tipped = true;
        }
    } else {
        const targetRoll = clamp(
            steeringReleased
                ? 0
                : -lateralAcceleration * config.rollPerLateralAcceleration,
            -config.maximumLean,
            config.maximumLean,
        );
        const returningToGround = (
            steeringReleased
            && Math.abs(state.roll) > 0.01
        );
        const rollStep = springStep(
            state.roll,
            state.rollVelocity,
            targetRoll,
            returningToGround
                ? config.rollReturnSpring
                : config.rollSpring,
            returningToGround
                ? config.rollReturnDamping
                : config.rollDamping,
            dt,
        );
        roll = rollStep.value;
        rollVelocity = rollStep.velocity;
    }

    const bounceAmplitude = Math.min(
        config.maximumBounce,
        Math.abs(speed) * 0.003,
    );
    const targetBounce = tipped
        ? 0
        : Math.sin(wheelRoll * 0.7) * bounceAmplitude;
    // The controller snaps the wheel contact plane to terrain. Offset the
    // sprung chassis in the opposite direction so it lags a curb or bump,
    // then let the suspension settle it back onto the contact plane.
    const displacedBounce = clamp(
        state.bounce - (Number(roadHeightDelta) || 0),
        -config.maximumBounce * 3,
        config.maximumBounce * 3,
    );
    const bounceStep = springStep(
        displacedBounce,
        state.bounceVelocity,
        targetBounce,
        config.bounceSpring,
        config.bounceDamping,
        dt,
    );

    return createForkliftChassisState({
        pitch,
        roll,
        bounce: bounceStep.value,
        pitchVelocity,
        rollVelocity,
        bounceVelocity: bounceStep.velocity,
        tipTimer,
        tippingDirection,
        pitchTippingDirection,
        tipped,
        previousSpeed: speed,
    });
}

export function forkliftChassisCanDrive(state) {
    return (
        !state?.tipped
        && state?.tippingDirection === 0
        && state?.pitchTippingDirection === 0
    );
}

export { DEFAULT_OPTIONS as DEFAULT_FORKLIFT_CHASSIS_OPTIONS };
