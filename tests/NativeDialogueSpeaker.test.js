import assert from "node:assert/strict";
import test from "node:test";
import {
  isRyoDialogueSpeaker,
  nativeDialogueDisplayText,
  nativeDialogueSpeakerLabel,
} from "../play/dialogue/NativeDialogueSpeaker.js";

const NAMED_SPEAKERS = {
  AKIR: "Ryo Hazuki",
  UNO_: "Tao Duo Ji",
  RNKT: "Tao Lin Xia",
  ONO_: "Goro Ono",
  TOM_: "Tom Johnson",
  INE_: "Ine Hayata",
  SERA: "Takeshi Sera",
  JOE_: "Jou Higuchi",
  RBRT: "Robert Wells",
  HARY: "Harry Thompson",
  JONZ: "Jones Henders",
  DOOR: "Voice Behind Door",
};

test("canonical dialogue participant codes resolve to display names", () => {
  for (const [speakerId, expected] of Object.entries(NAMED_SPEAKERS)) {
    assert.equal(nativeDialogueSpeakerLabel({ speakerId }), expected);
  }
});

test("scheduled actor labels remain the fallback for ordinary participants", () => {
  assert.equal(
    nativeDialogueSpeakerLabel({
      speakerId: "HATO",
    }),
    "Yoshifumi Hato",
  );
});

test("generic subtitle participants use their authored Japanese role", () => {
  assert.equal(
    nativeDialogueSpeakerLabel({
      speakerId: "XXXX",
      sourceText: "フォーク作業員「Watch out!」",
    }),
    "Forklift Operator",
  );
  assert.equal(
    nativeDialogueSpeakerLabel({
      speakerId: "XXXX",
      sourceText: "外人「Hello.」",
    }),
    "Foreigner",
  );
});

test("Ryo detection uses the authored AKIR identity", () => {
  assert.equal(isRyoDialogueSpeaker("AKIR"), true);
  assert.equal(isRyoDialogueSpeaker({ speakerId: "AKIR" }), true);
  assert.equal(isRyoDialogueSpeaker({ speakerId: "TOM_" }), false);
});

test("unlocalized authored text remains available as subtitle fallback", () => {
  assert.equal(
    nativeDialogueDisplayText({
      displayText: null,
      sourceText: "宮城「The general public isn't＆allowed in here!」",
    }),
    "The general public isn't\nallowed in here!",
  );
  assert.equal(
    nativeDialogueDisplayText({
      sourceText: "涼「Sorry, but=@」",
    }),
    "Sorry, but...",
  );
});
