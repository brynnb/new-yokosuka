import assert from "node:assert/strict";
import test from "node:test";

import {
  createScriptEventPresentationCatalog,
  scriptEventPlayerMotionDefinitions,
} from "../play/scripts/ScriptEventPresentationCatalog.js";
import {
  createScriptEventPresentationRuntime,
} from "../play/scripts/ScriptEventPresentationRuntime.js";

function command(name, ...values) {
  return {
    name,
    arguments: values.map(value => ({
      type: "string",
      isStatic: true,
      value,
    })),
  };
}

function harness() {
  const calls = [];
  const adapters = Object.fromEntries([
    "startCamera", "stopCamera", "playPlayerMotion", "lookAtActor",
    "clearActorLook", "playSequence", "startActivity", "commit", "rollback", "update",
  ].map(name => [name, (...args) => {
    calls.push([name, ...args]);
    return true;
  }]));
  adapters.begin = context => {
    calls.push(["begin", context]);
    return { owner: "event-1" };
  };
  return {
    calls,
    runtime: createScriptEventPresentationRuntime({ adapters }),
  };
}

test("catalog exposes only exact reviewed presentation and activity records", () => {
  const catalog = createScriptEventPresentationCatalog();
  assert.deepEqual(catalog.camera("d000.hato.camera.2952"), {
    area: "D000",
    cameraNumber: 2952,
  });
  assert.deepEqual(catalog.playerMotion("d000.hato.player-motion.903"), {
    actorCode: "AKIR",
    request: 903,
    name: "AKI_AKI_TATI_IWA_L",
    motionFile: null,
    parameters: [-1, -1, -1, 1],
  });
  assert.equal(catalog.camera("d000.hato.camera.guessed"), null);
  assert.deepEqual(catalog.activity("d000.telephone-book.native"), {
    kind: "native-object-interaction",
    area: "D000",
    objectTag: "TBK1",
    action: 1,
    durableEffects: "forbidden",
    programId: "disc1-d000-phone-book-0x6a49c",
    source: "D000 persistent owner 0x69b14 > TBK1 > 0x6a49c",
  });
});

test("runtime dispatches Hato commands through an owned transaction", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "D000", actorCode: "HATO" });
  await runtime.execute(command("start_camera", "d000.hato.camera.2950"));
  await runtime.execute(command("look_at_actor", "HATO", "AKIR"));
  await runtime.execute(command(
    "play_player_motion",
    "d000.hato.player-motion.903",
  ));
  await runtime.execute(command("clear_actor_look", "HATO"));
  await runtime.execute(command("stop_camera"));
  runtime.commit();
  assert.deepEqual(calls.map(([name]) => name), [
    "begin", "startCamera", "lookAtActor", "playPlayerMotion",
    "clearActorLook", "stopCamera", "commit",
  ]);
  assert.equal(runtime.transaction, null);
});

test("door 51 catalog retains its exact XMPT and motion-cue route", () => {
  const catalog = createScriptEventPresentationCatalog();
  const start = catalog.sequence("d000.door.51.closed-check.start");
  const finish = catalog.sequence("d000.door.51.closed-check.finish");
  assert.deepEqual(start.alignment, {
    target: [6.452099800109863, 0.07000000029802322, 84.81649780273438],
    requestWord: 58254,
    requestDword: 594,
    stateSelector: 0,
    motion: { request: 594, name: "AKI_AKI_BASE", motionFile: null },
  });
  assert.equal(start.motion.request, 28677);
  assert.deepEqual(start.cues.map(cue => cue.phase), [58, 82]);
  assert.equal(start.dialoguePhase, 150);
  assert.equal(finish.sequenceId, start.sequenceId);
});

test("telephone sequence dispatches after its exact TEL_ adapter is proven", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "JOMO" });
  await runtime.execute(command(
    "play_sequence",
    "jomo.telephone.answer.sa1093.first",
  ));
  assert.equal(
    calls.some(([name]) => name === "playSequence"),
    true,
  );
  runtime.rollback("test-complete");
});

test("telephone catalog retains concurrent native call timing", () => {
  const catalog = createScriptEventPresentationCatalog();
  const answer = catalog.sequence("jomo.telephone.answer.sa1093.first");
  const hangup = catalog.sequence("jomo.telephone.hangup.sa1093.first");
  assert.equal(answer.kind, "telephone-call-start");
  assert.equal(answer.executable, true);
  assert.equal(answer.motion.request, 8254);
  assert.equal(answer.motion.name, "AKI_DERU_DENWA_A_GORODENWA_F");
  assert.equal(answer.motion.motionFile, "M_JOMO.MOTN");
  assert.deepEqual(answer.motion.nativeRegistry, {
    lowerExclusive: 0x2000,
    upperExclusive: 0x2046,
    index: 61,
  });
  assert.equal(answer.answer.tick, 123);
  assert.equal(answer.dialogueLeadInTicks, 150);
  assert.equal(answer.hangup.tick, 904);
  assert.equal(hangup.kind, "telephone-call-finish");
  assert.equal(hangup.callId, answer.callId);
  assert.equal(hangup.behavior, "join-active-call-timeline");
  assert.equal(answer.answer.receiver.objectRenderKey, 3);
  assert.equal(answer.answer.receiver.actorRenderKey, -0x42);
  assert.equal(answer.answer.receiver.actorRuntimeMatrixIndex, 30);
  assert.deepEqual(answer.answer.receiver.handCorrection, {
    translation: [0.02499999850988388, 0.07499999552965164, 0],
    rotationAxis: "z",
    rotationFixedTurnRaw: 0x4000,
  });
});

test("player motion preload definitions come from the reviewed catalog", () => {
  assert.deepEqual(scriptEventPlayerMotionDefinitions(), [
    {
      request: 903,
      name: "AKI_AKI_TATI_IWA_L",
      motionFile: null,
    },
    {
      request: 100,
      name: "AKI_AKI_TURN180_L",
      motionFile: null,
    },
    {
      request: 1554,
      name: "AKI_AKANAI_HIKIDO_F",
      motionFile: null,
    },
    {
      request: 594,
      name: "AKI_AKI_BASE",
      motionFile: null,
    },
    {
      request: 28677,
      name: "AKI_HITORIGOTO_R_RYURIHATUTEN",
      motionFile: "M_D000.MOTN",
    },
    {
      request: 8254,
      name: "AKI_DERU_DENWA_A_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
    },
    {
      request: 8255,
      name: "AKI_DERU_DENWA_B_GORODENWA_F",
      motionFile: "M_JOMO.MOTN",
    },
  ]);
});

test("runtime dispatches a registered specialized activity and waits", async () => {
  const { runtime, calls } = harness();
  runtime.begin({ area: "D000", objectTag: "TBK1" });
  await runtime.execute(command("start_activity", "d000.telephone-book.native"));
  assert.equal(calls.some(([name]) => name === "startActivity"), true);
  runtime.commit();
});

test("runtime rejects dynamic and unknown identifiers", async () => {
  const { runtime } = harness();
  runtime.begin({ area: "D000" });
  await assert.rejects(runtime.execute({
    name: "start_camera",
    arguments: [{ type: "string", isStatic: false, value: "x" }],
  }), /static string/);
  await assert.rejects(
    runtime.execute(command("start_camera", "unknown.camera")),
    /unknown authored camera/,
  );
  runtime.rollback();
});
