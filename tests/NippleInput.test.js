import assert from "node:assert/strict";
import test from "node:test";

import { nippleMovementData } from "../src/NippleInput.js";

test("reads nipplejs 1.x movement data from the event wrapper", () => {
    const data = { vector: { x: 0.25, y: 0.75 } };
    assert.equal(nippleMovementData({ data }), data);
});

test("accepts the legacy second callback argument", () => {
    const data = { vector: { x: -0.5, y: 0.5 } };
    assert.equal(nippleMovementData({}, data), data);
    assert.equal(nippleMovementData(null, null), null);
});
