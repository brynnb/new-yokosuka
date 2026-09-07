import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { MotnLoader } from "../src/MotnLoader.js";

test("native mirror setup follows record sizes and ignores opcode-looking payloads", () => {
    const bytes = new Uint8Array(40);
    bytes.set([0x14, 0x13, 0, 0, 0x13, 0, 0, 0, 8]);
    const loader = new MotnLoader(bytes);
    assert.deepEqual(loader.parseMotionMirrorSetup(0, 9), { mirrored: true, complete: true });
    bytes[4] = 8;
    assert.deepEqual(loader.parseMotionMirrorSetup(0, 9), { mirrored: false, complete: true });
    bytes[0] = 0xfe;
    assert.equal(loader.parseMotionMirrorSetup(0, 9).complete, false);
    bytes[0] = 0x14;
    assert.equal(loader.parseMotionMirrorSetup(0, 2).complete, false);
});

function fileArrayBuffer(filename) {
    const bytes = fs.readFileSync(filename);
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    );
}

test("samples MOTN curves with the game's 30 Hz cubic Hermite equation", () => {
    const curve = {
        channel: "tx",
        samples: [
            {
                frame: 0,
                value: 2,
                incomingTangent: 0,
                outgoingTangent: 30,
            },
            {
                frame: 30,
                value: 4,
                incomingTangent: -30,
                outgoingTangent: 0,
            },
        ],
    };

    // At t=0.5 the Hermite bases are h00=h01=0.5,
    // h10=0.125, and h11=-0.125. The key span is one second.
    assert.equal(MotnLoader.sampleCurve(curve, 15), 10.5);
});

test("converts MOTN rotation turns to principal-angle radians after sampling", () => {
    const quarterTurn = {
        channel: "rx",
        samples: [{ frame: 0, value: 0.25 }],
    };
    const threeQuarterTurn = {
        channel: "rz",
        samples: [{ frame: 0, value: 0.75 }],
    };

    assert.equal(MotnLoader.sampleCurve(quarterTurn, 0), Math.PI / 2);
    assert.equal(MotnLoader.sampleCurve(threeQuarterTurn, 0), -Math.PI / 2);
    assert.equal(MotnLoader.sampleCurveRaw(threeQuarterTurn, 0), 0.75);
});

test("places the duplicated terminal key at the runtime's final sample index", () => {
    const loader = new MotnLoader(new Uint8Array([0]));
    const frameData = loader.parseFrameData(
        [{ boneId: 0, channel: "tz" }],
        { start: 0, end: 1, length: 1 },
        { start: 1, end: 1, length: 0 },
        60,
    );

    assert.deepEqual(frameData.groups[0].keyFrames, [0, 59]);
});

test("reads the original controller-family selector from MOTN metadata", () => {
    const movement = MotnLoader.parse(
        fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
        {
            sequenceNames: [
                "GAK_WALK_LP_F",
                "JIJ_YNG_WALK_LP_F",
                "SIN_SIN_WALK_LP",
                "PNW_WALK_LP_F",
            ],
        },
    );
    const familyByName = new Map(
        movement.sequences.map((sequence) => [
            sequence.name,
            sequence.controllerFamilyIndex,
        ]),
    );

    assert.equal(familyByName.get("GAK_WALK_LP_F"), 4);
    assert.equal(familyByName.get("JIJ_YNG_WALK_LP_F"), 7);
    assert.equal(familyByName.get("SIN_SIN_WALK_LP"), 15);
    assert.equal(familyByName.get("PNW_WALK_LP_F"), 19);
});

test("selectively expands MOTN sequences by native numeric index", () => {
    const movement = MotnLoader.parse(
        fileArrayBuffer("play/assets/scheduled-actors/M_MBAS.BIN"),
        { sequenceIndices: [0, 3] },
    );
    assert.deepEqual(
        movement.sequences.map(({ index, name }) => [index, name]),
        [
            [0, "AKI_AKI_BAT_RUN_R_LP"],
            [3, "CAT_CAT_FUSE_LP"],
        ],
    );
});
