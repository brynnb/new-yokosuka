import assert from "node:assert/strict";
import test from "node:test";

import {
  TRANSIENT_NOTICE_MAX_DURATION_MILLISECONDS,
  TransientNotice,
} from "../play/ui/TransientNotice.js";

function harness() {
  const element = {
    hidden: true,
    textContent: "",
  };
  const scheduled = [];
  const cleared = [];
  const notice = new TransientNotice({
    element,
    setTimeoutFn(callback, duration) {
      const id = scheduled.length;
      scheduled.push({ callback, duration });
      return id;
    },
    clearTimeoutFn(id) {
      cleared.push(id);
    },
  });
  return { element, scheduled, cleared, notice };
}

test("a transient notice remains visible for no more than two seconds", () => {
  const { element, scheduled, notice } = harness();

  notice.show("NPC is too far to talk to.", 5000);

  assert.equal(element.hidden, false);
  assert.equal(element.textContent, "NPC is too far to talk to.");
  assert.equal(notice.active, true);
  assert.equal(
    scheduled[0].duration,
    TRANSIENT_NOTICE_MAX_DURATION_MILLISECONDS,
  );

  scheduled[0].callback();
  assert.equal(element.hidden, true);
  assert.equal(notice.active, false);
});

test("a new notification immediately replaces the current notice", () => {
  const { element, scheduled, cleared, notice } = harness();

  notice.show("First");
  notice.show("Second");

  assert.deepEqual(cleared, [0]);
  assert.equal(element.textContent, "Second");
  assert.equal(element.hidden, false);
  scheduled[1].callback();
  assert.equal(element.hidden, true);
});

test("a notice can be interrupted before its timeout", () => {
  const { element, cleared, notice } = harness();

  notice.show("Temporary");
  notice.hide();

  assert.deepEqual(cleared, [0]);
  assert.equal(notice.active, false);
  assert.equal(element.hidden, true);
});
