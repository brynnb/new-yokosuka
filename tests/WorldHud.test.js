import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGameDate,
  formatGameTime,
} from "../play/ui/WorldHud.js";

test("formats Shenmue loading-screen date and time", () => {
  const date = new Date(Date.UTC(1986, 5, 9, 16, 20));
  assert.equal(formatGameTime(date), "4:20 pm");
  assert.equal(formatGameDate(date), "Jun. 9, 1986 (Mon.)");
});
