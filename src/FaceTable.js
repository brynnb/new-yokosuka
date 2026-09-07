const HEADER_BYTE_LENGTH = 0x30;
const CONTROL_RECORD_BYTE_LENGTH = 0x30;
const FIXED_TURN_RADIANS = (Math.PI * 2) / 0x10000;

function viewFor(input) {
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("FACE table input must be binary data");
}

function finiteFloat(view, offset, label) {
  const value = view.getFloat32(offset, true);
  if (!Number.isFinite(value)) {
    throw new Error(`FACE table ${label} is not finite`);
  }
  return value;
}

/**
 * Parse a Shenmue I *_FTBL.BIN face-control table.
 *
 * The three offsets at 0x24..0x2f delimit the per-vertex contribution
 * counts, flat control-index array, and parallel float-weight array. The
 * caller supplies the primary *_F.MT5 vertex count because each section is
 * independently padded and that model is the authoritative count boundary.
 */
export function parseFaceTable(input, { vertexCount } = {}) {
  const view = viewFor(input);
  if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
    throw new TypeError("FACE table requires the primary face vertex count");
  }
  if (view.byteLength < HEADER_BYTE_LENGTH) {
    throw new Error("FACE table header is truncated");
  }

  const payloadOffset = view.getUint32(0x04, true);
  const countOffset = view.getUint32(0x24, true);
  const controlIndexOffset = view.getUint32(0x28, true);
  const weightOffset = view.getUint32(0x2c, true);
  if (
    payloadOffset !== HEADER_BYTE_LENGTH
    || controlIndexOffset < payloadOffset
    || weightOffset < controlIndexOffset
    || countOffset < weightOffset
    || countOffset + vertexCount * 4 > view.byteLength
    || (controlIndexOffset - payloadOffset) % CONTROL_RECORD_BYTE_LENGTH !== 0
    || (weightOffset - controlIndexOffset) % 4 !== 0
    || (countOffset - weightOffset) % 4 !== 0
  ) {
    throw new Error("FACE table section offsets are invalid");
  }

  // FUN_0c0bcc84 copies these six signed fixed-turn values from the FTBL
  // header into FACE +0xb0..+0xc4. FUN_0c0bcaec then clamps the shared
  // vertical angle and each eye's horizontal angle against those exact
  // limits. They are model data: different faces have deliberately different
  // ranges, so keep them with the parsed table instead of imposing a global
  // browser-side eye limit.
  const angleLimitRaw = Array.from(
    { length: 6 },
    (_, index) => view.getInt32(0x0c + index * 4, true),
  );
  const angleLimitRadians = angleLimitRaw.map(
    value => value * FIXED_TURN_RADIANS,
  );

  const controlCount = (
    controlIndexOffset - payloadOffset
  ) / CONTROL_RECORD_BYTE_LENGTH;
  const controls = Array.from({ length: controlCount }, (_, index) => {
    const offset = payloadOffset + index * CONTROL_RECORD_BYTE_LENGTH;
    const marker = view.getUint32(offset + 0x0c, true);
    if (marker === 0 || marker > 32) {
      throw new Error(`FACE control ${index} has an invalid marker`);
    }
    return Object.freeze({
      index,
      marker,
      firstPosition: Object.freeze([
        finiteFloat(view, offset, `control ${index} first X`),
        finiteFloat(view, offset + 4, `control ${index} first Y`),
        finiteFloat(view, offset + 8, `control ${index} first Z`),
      ]),
      secondPosition: Object.freeze([
        finiteFloat(view, offset + 0x10, `control ${index} second X`),
        finiteFloat(view, offset + 0x14, `control ${index} second Y`),
        finiteFloat(view, offset + 0x18, `control ${index} second Z`),
      ]),
      angle: finiteFloat(view, offset + 0x1c, `control ${index} angle`),
      tail: Object.freeze(Array.from(
        { length: 4 },
        (_, tailIndex) => finiteFloat(
          view,
          offset + 0x20 + tailIndex * 4,
          `control ${index} tail ${tailIndex}`,
        ),
      )),
    });
  });

  const availableControlIndices = (weightOffset - controlIndexOffset) / 4;
  const availableWeights = (countOffset - weightOffset) / 4;
  const vertexContributions = [];
  let contributionCursor = 0;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const contributionCount = view.getUint32(
      countOffset + vertexIndex * 4,
      true,
    );
    if (
      contributionCursor + contributionCount > availableControlIndices
      || contributionCursor + contributionCount > availableWeights
    ) {
      throw new Error(`FACE vertex ${vertexIndex} contributions are truncated`);
    }
    const contributions = [];
    for (let index = 0; index < contributionCount; index += 1) {
      const flatIndex = contributionCursor + index;
      const controlIndex = view.getUint32(
        controlIndexOffset + flatIndex * 4,
        true,
      );
      const weight = finiteFloat(
        view,
        weightOffset + flatIndex * 4,
        `vertex ${vertexIndex} weight ${index}`,
      );
      if (controlIndex >= controlCount || weight < 0 || weight > 1.001) {
        throw new Error(`FACE vertex ${vertexIndex} contribution ${index} is invalid`);
      }
      contributions.push(Object.freeze({ controlIndex, weight }));
    }
    contributionCursor += contributionCount;
    vertexContributions.push(Object.freeze(contributions));
  }

  return Object.freeze({
    controlCount,
    controls: Object.freeze(controls),
    vertexCount,
    contributionCount: contributionCursor,
    vertexContributions: Object.freeze(vertexContributions),
    eyeAngleLimits: Object.freeze({
      raw: Object.freeze({
        vertical: Object.freeze({
          maximum: angleLimitRaw[0],
          minimum: angleLimitRaw[1],
        }),
        eyes: Object.freeze([
          Object.freeze({
            maximum: angleLimitRaw[2],
            minimum: angleLimitRaw[3],
          }),
          Object.freeze({
            maximum: angleLimitRaw[4],
            minimum: angleLimitRaw[5],
          }),
        ]),
      }),
      radians: Object.freeze({
        vertical: Object.freeze({
          maximum: angleLimitRadians[0],
          minimum: angleLimitRadians[1],
        }),
        eyes: Object.freeze([
          Object.freeze({
            maximum: angleLimitRadians[2],
            minimum: angleLimitRadians[3],
          }),
          Object.freeze({
            maximum: angleLimitRadians[4],
            minimum: angleLimitRadians[5],
          }),
        ]),
      }),
    }),
    offsets: Object.freeze({
      payload: payloadOffset,
      controlIndices: controlIndexOffset,
      weights: weightOffset,
      counts: countOffset,
    }),
  });
}

export const FACE_TABLE_CONTROL_RECORD_BYTE_LENGTH = CONTROL_RECORD_BYTE_LENGTH;
