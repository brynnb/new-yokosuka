import * as BABYLON from "@babylonjs/core";

// Directly ported from Lucky Break's StickAssetRepository,
// CueGeometryController, CueAnimation, and ShotPullback.
const BALL_RADIUS = 0.03;
const TIP_RADIUS = 0.004379;
const BUTT_RADIUS = 0.018988;
const CUE_LENGTH = 1.399841;
const MID_RADIUS = 0.5 * (TIP_RADIUS + BUTT_RADIUS);
const MAX_TIP_OFFSET = Math.min(
  0.6 * BALL_RADIUS,
  0.99 * (BALL_RADIUS - MID_RADIUS),
);
const SUPPORT_DISTANCE = 0.66;
const SUPPORT_HEIGHT = 0.5 * BALL_RADIUS + MID_RADIUS;
const PULLBACK_GAP = -0.015;
const MAX_PULLBACK_LENGTH = 0.25;

function power1EaseOut(value) {
  return 2 * value - value * value;
}

function power3EaseInOut(value) {
  if (value < 0.5) return 8 * value ** 4;
  const inverse = 1 - value;
  return 1 - 8 * inverse ** 4;
}

function raySphereEntryDistance(originOffset, direction, radius) {
  const projection = BABYLON.Vector3.Dot(direction, originOffset);
  const outside = originOffset.lengthSquared() - radius * radius;
  if (outside > 0 && projection > 0) return Number.POSITIVE_INFINITY;
  const discriminant = projection * projection - outside;
  if (discriminant <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, -projection - Math.sqrt(discriminant));
}

export function luckyBreakStrokeTiming(power) {
  const easedPower = power1EaseOut(BABYLON.Scalar.Clamp(power, 0, 1));
  const pullbackDistance = easedPower * MAX_PULLBACK_LENGTH;
  const pullbackDuration = 0.3 + 0.3 * easedPower;
  const touchSpeed = 0.5 + 11 * power;
  const forwardDistance = pullbackDistance - PULLBACK_GAP;
  const forwardDuration = 2 * forwardDistance / touchSpeed;
  return {
    pullbackDistance,
    pullbackDuration,
    forwardDuration,
    contactTime: pullbackDuration + forwardDuration,
    forwardAcceleration: touchSpeed / forwardDuration,
  };
}

export function luckyBreakCueLeadingSpace(strokeState) {
  if (!strokeState) return PULLBACK_GAP;
  const timing = strokeState.timing
    || luckyBreakStrokeTiming(strokeState.shot.power);
  if (strokeState.elapsed <= timing.pullbackDuration) {
    const progress = strokeState.elapsed / timing.pullbackDuration;
    return PULLBACK_GAP
      - power3EaseInOut(progress) * timing.pullbackDistance;
  }
  const forwardElapsed = Math.min(
    timing.forwardDuration,
    strokeState.elapsed - timing.pullbackDuration,
  );
  return PULLBACK_GAP
    - timing.pullbackDistance
    + 0.5 * timing.forwardAcceleration * forwardElapsed ** 2;
}

export class LuckyBreakCueController {
  constructor() {
    this.tipPoint = new BABYLON.Vector3();
    this.supportPoint = new BABYLON.Vector3();
    this.kissPoint = new BABYLON.Vector3();
    this.kissDirection = new BABYLON.Vector3(1, 0, 0);
    this.centerPosition = new BABYLON.Vector3();
    this.rotation = BABYLON.Quaternion.Identity();
    this.rotationMatrix = BABYLON.Matrix.Identity();
  }

  update({ cueBall, aimAngle, sideSpin, topSpin, strokeState }) {
    const target = cueBall.position;
    const sideOffset = BABYLON.Scalar.Clamp(sideSpin, -1, 1)
      * MAX_TIP_OFFSET;
    const verticalOffset = BABYLON.Scalar.Clamp(topSpin, -1, 1)
      * MAX_TIP_OFFSET;
    const horizontalRotation = -aimAngle;
    const cosine = Math.cos(horizontalRotation);
    const sine = Math.sin(horizontalRotation);

    // Lucky Break's local tip is (0, vertical, side), while its support point
    // is behind the tip at (-0.66, supportHeight, 0).
    this.tipPoint.set(
      target.x + sideOffset * sine,
      target.y + verticalOffset,
      target.z + sideOffset * cosine,
    );
    this.supportPoint.set(
      target.x - SUPPORT_DISTANCE * cosine,
      target.y + SUPPORT_HEIGHT,
      target.z + SUPPORT_DISTANCE * sine,
    );
    this.tipPoint.subtractToRef(
      this.supportPoint,
      this.kissDirection,
    );
    this.kissDirection.normalize();

    const supportOffset = this.supportPoint.subtract(
      new BABYLON.Vector3(target.x, target.y, target.z),
    );
    const kissDistance = raySphereEntryDistance(
      supportOffset,
      this.kissDirection,
      BALL_RADIUS + TIP_RADIUS,
    );
    this.kissPoint.copyFrom(this.supportPoint).addInPlace(
      this.kissDirection.scale(kissDistance),
    );

    const leadingSpace = luckyBreakCueLeadingSpace(strokeState);
    this.centerPosition.copyFrom(this.kissPoint).addInPlace(
      this.kissDirection.scale(leadingSpace - CUE_LENGTH * 0.5),
    );

    const rotationY = Math.atan2(
      -this.kissDirection.z,
      this.kissDirection.x,
    );
    const rotationZ = Math.asin(this.kissDirection.y);
    const cosY = Math.cos(rotationY);
    const sinY = Math.sin(rotationY);
    const cosZ = Math.cos(rotationZ);
    const sinZ = Math.sin(rotationZ);
    BABYLON.Matrix.FromValuesToRef(
      cosY * cosZ, sinZ, -cosZ * sinY, 0,
      -cosY * sinZ, cosZ, sinZ * sinY, 0,
      sinY, 0, cosY, 0,
      0, 0, 0, 1,
      this.rotationMatrix,
    );
    BABYLON.Quaternion.FromRotationMatrixToRef(
      this.rotationMatrix,
      this.rotation,
    );
    return this;
  }
}

export const LUCKY_BREAK_MAX_TIP_OFFSET = MAX_TIP_OFFSET;
