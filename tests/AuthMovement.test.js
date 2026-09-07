import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  evaluateAuthActor,
  parseAuthMovement,
} from "../src/AuthMovement.js";

const discWork = process.env.NEW_YOKOSUKA_DISC_WORK || ".disc-work";
const sequencePath = `${discWork}/exact/d000/unpacked/BUSS/SEQDATA2.AUTH`;

test("AUTH AMOV parser recovers the captured BUS_ and BUSS initial poses", {
  skip: !fs.existsSync(sequencePath),
}, () => {
  const movement = parseAuthMovement(fs.readFileSync(sequencePath));
  assert.equal(movement.actors.length, 3);
  assert.deepEqual(
    movement.actors.map((actor) => actor.tag),
    ["BUS_", "BUSS", "AKIR"],
  );

  const bus = evaluateAuthActor(movement.actors[0], 0);
  const driver = evaluateAuthActor(movement.actors[1], 0);
  assert.ok(Math.abs(bus.x - 50.34690094) < 1e-5);
  assert.ok(Math.abs(bus.y) < 1e-6);
  assert.ok(Math.abs(bus.z - 5.97522211) < 1e-5);
  assert.ok(Math.abs(bus.rotationY - 62.68159485) < 1e-5);
  assert.ok(Math.abs(driver.x - 48.014328) < 1e-5);
  assert.ok(Math.abs(driver.y - 0.726606) < 1e-5);
  assert.ok(Math.abs(driver.z - 3.98772287) < 1e-5);
});

test("SEQDATA2 and SEQDATA5 contain the same authored movement chunk", {
  skip: !fs.existsSync(sequencePath),
}, () => {
  const first = parseAuthMovement(fs.readFileSync(sequencePath));
  const second = parseAuthMovement(fs.readFileSync(
    `${discWork}/exact/d000/unpacked/BUSS/SEQDATA5.AUTH`,
  ));
  assert.deepEqual(first.actors, second.actors);
});
