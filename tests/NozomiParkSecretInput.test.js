import test from "node:test";
import assert from "node:assert/strict";
import { NozomiParkInputCapture, isNozomiParkApproach } from "../play/events/NozomiParkSecretInput.js";

test("the two retail park approaches alone record changing held controls", () => {
  for (const part of ["main", "alternate", "confrontation", "aftermath"]) {
    assert.equal(isNozomiParkApproach("story-s1-nozomi-park-rescue-" + part),
      part === "main" || part === "alternate");
  }
  const listeners = new Map();
  const target = {
    addEventListener(name, fn, capture) {
      if (name !== "blur") assert.equal(capture, true);
      listeners.set(name, fn);
    },
    removeEventListener(name, fn) {
      assert.equal(listeners.get(name), fn);
      listeners.delete(name);
    },
  };
  const pad = { mapping:"standard", buttons:Array.from({length:16}, () => ({ pressed:false })) };
  const input = new NozomiParkInputCapture({ target, gamepads:() => [pad] });
  const key = (type, code) => listeners.get(type)({code});
  key("keydown","KeyY"); input.sample(2); input.sample(3);
  key("keyup","KeyY"); input.sample(3); input.sample(4);
  key("keydown","KeyY"); input.sample(5);
  key("keyup","KeyY");
  pad.buttons[1].pressed=true; input.sample(7);
  pad.buttons[1].pressed=false; key("keydown","KeyJ"); input.sample(10);
  key("keyup","KeyJ"); key("keydown","Enter"); input.sample(13);
  listeners.get("blur")(); input.sample(14);
  assert.deepEqual(input.samples, [
    {frame:2,mask:2},{frame:4,mask:0},{frame:5,mask:2},{frame:7,mask:512},
    {frame:10,mask:4},{frame:13,mask:1024},{frame:14,mask:0},
  ]);
  pad.buttons[6].value=0.1; input.sample(15);
  assert.deepEqual(input.samples.at(-1),{frame:15,mask:0x40});
  pad.buttons[6].value=0; pad.buttons[7].value=1; input.sample(16);
  assert.deepEqual(input.samples.at(-1),{frame:16,mask:0x80});
  input.dispose();
  assert.equal(listeners.size, 0);
});
