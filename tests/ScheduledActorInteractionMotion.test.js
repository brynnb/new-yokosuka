import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduledActorMotionSelection,
} from "../play/characters/ScheduledActorMotionRuntime.js";
import catalog from "../play/data/scheduled-actors.json" with {
  type: "json",
};
import {
  scheduledActorInteractionMotionCandidates,
} from "../src/ScheduledActorMotionRegistry.js";
import {
  scheduledDescriptorState,
} from "../tools/lib/ScheduledActorOfflineRuntime.js";
import {
  linkedRoutesByOffset,
  runtimeJourneys,
} from "../tools/lib/runtime_npc_manifest.js";

const akihitoSource = catalog.actors.find(
  (actor) => actor.instanceId === "TKNB:4d575ed2791d",
);
const akihitoVariant = akihitoSource.scheduleVariants.find(
  (variant) => (
    variant.scheduleVariantId === akihitoSource.defaultScheduleVariantId
  ),
);
const akihito = {
  ...akihitoSource,
  journeys: runtimeJourneys(
    akihitoSource,
    akihitoVariant,
    linkedRoutesByOffset(catalog),
  ),
};

test("operation 0x17 exposes the native two-value ambient-motion domain", () => {
  const mary = akihito.journeys[0].operations.find(
    (operation) => operation.operation === 0x17
      && operation.targetCode === "MARY",
  );
  assert.deepEqual(
    scheduledActorInteractionMotionCandidates(mary.controlValues),
    [0x80fc, 0x80e0],
  );
  assert.deepEqual(
    scheduledActorMotionSelection({ motionStateId: 0x80fc }),
    {
      bank: "mobj",
      name: "OTH_LOOK_PUNF_LP_F",
      loop: true,
    },
  );
  assert.deepEqual(
    scheduledActorMotionSelection({ motionStateId: 0x80e0 }),
    {
      bank: "mobj",
      name: "OTH_CHU_MITERU_TOBAKU_LP_F",
      loop: true,
    },
  );
});

test("Akihito retains the exact interaction domain over his default idle", () => {
  const state = scheduledDescriptorState(
    akihito,
    new Date(Date.UTC(2026, 6, 27, 16, 20)),
    { D000: "dobuita" },
  );
  assert.equal(state.operation, 4);
  assert.equal(state.interactionTargetCode, "MARY");
  assert.deepEqual(state.interactionMotionStateIds, [0x80fc, 0x80e0]);
  assert.equal(state.interactionMotionSelection, null);
  assert.equal(state.motionStateId, 0x8143);
  assert.deepEqual(scheduledActorMotionSelection(state), {
    bank: "mobj",
    name: "OTH_TATI_2_LP_F",
    loop: true,
  });
});
