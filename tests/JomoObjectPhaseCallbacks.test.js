import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(readFileSync(
  new URL(
    "../tools/evidence/jomo-object-phase-callbacks.json",
    import.meta.url,
  ),
));

test("operation 0x0139 mode 21 installs two opaque phase values", () => {
  assert.equal(
    evidence.schema,
    "new-yokosuka-jomo-object-phase-callbacks-v3",
  );
  assert.deepEqual(evidence.operation0139Mode21, {
    operationId: "0x0139",
    mode: 21,
    handlerAddress: "0x0c165544",
    modeTableAddress: "0x0c165578",
    modeTableRelativeValue: "0x00fc",
    modeEntryAddress: "0x0c16566e",
    forwardCallAddress: "0x0c165674",
    forwardTargetAddress: "0x0c0ccb14",
    arguments: [
      {
        descriptorIndex: 1,
        sourceRegister: "r14",
        destinationRegister: "r4",
        storedAt: "0x0c2164e8",
      },
      {
        descriptorIndex: 2,
        sourceRegister: "r12",
        destinationRegister: "r5",
        storedAt: "0x0c2164ec",
      },
    ],
    behavior: (
      "Stores the two descriptor values unchanged in the engine's one-shot "
      + "object-action phase slots."
    ),
  });
});

test("selector 10 and 11 dispatch and clear both phase slots", () => {
  assert.deepEqual(evidence.enginePhaseDispatch.selectorFamily, [10, 11]);
  assert.equal(
    evidence.enginePhaseDispatch.typedCommandDispatcherAddress,
    "0x0c17a91c",
  );
  assert.deepEqual(
    evidence.enginePhaseDispatch.sites.map((site) => [
      site.slotAddress,
      site.dispatcherCallAddress,
      site.clearAddress,
    ]),
    [
      ["0x0c2164e8", "0x0c0cb506", "0x0c0cb514"],
      ["0x0c2164ec", "0x0c0cb56e", "0x0c0cb57c"],
      ["0x0c2164e8", "0x0c0cb778", "0x0c0cb784"],
      ["0x0c2164ec", "0x0c0cb806", "0x0c0cb812"],
    ],
  );
  for (const site of evidence.enginePhaseDispatch.sites) {
    assert.equal(
      site.semantics,
      "dispatch once when nonzero, then clear to zero",
    );
  }
});

test("JOMO drawer phase words resolve as location-bank A905 sounds", () => {
  const [group0, group1] = evidence.jomo.groups;
  assert.equal(group0.containsDrawerATS1, true);
  assert.ok(group0.objectTags.includes("ATS1"));
  assert.equal(group1.containsDrawerATS1, false);
  for (const group of [group0, group1]) {
    const commands = group.phaseTokens
      .filter(({ classification }) => (
        classification === "location-bank-sfx-command"
      ));
    assert.deepEqual(
      commands.map(({ littleEndianBytes }) => littleEndianBytes),
      ["a9050b00", "a9050a00", "a9056400"],
    );
    assert.deepEqual(
      commands.map(({ locationBankResolution }) => (
        locationBankResolution.entries[0].sampleId
      )),
      [31, 30, 32],
    );
    assert.ok(commands.every(({ locationBankResolution }) => (
      locationBankResolution.entries[0].sampleRate === 11025
    )));
  }
  assert.equal(
    evidence.enginePhaseDispatch.soundCommandRoute.queueAddress,
    "0x0c1d4b18",
  );
  assert.equal(
    evidence.enginePhaseDispatch.soundCommandRoute.jomoA905TakesSoundQueue,
    true,
  );
  assert.equal(
    evidence.audioBoundary.policy,
    "phase-labels-dynamically-proven",
  );
  assert.match(evidence.audioBoundary.consequence, /authentic object-audio/);
});

test("synchronized retail trace labels all nonzero ATS1 drawer phases", () => {
  assert.deepEqual(
    evidence.runtimePhaseTrace.events.map((event) => ({
      phase: event.phase,
      visualStateBefore: event.visualStateBefore,
      commandHex: event.commandHex,
      playbackId: event.playbackId,
      sampleId: event.sampleId,
    })),
    [
      {
        phase: "openingStart",
        visualStateBefore: "closed",
        commandHex: "a9050b00",
        playbackId: 8,
        sampleId: 31,
      },
      {
        phase: "closingStart",
        visualStateBefore: "open",
        commandHex: "a9050a00",
        playbackId: 7,
        sampleId: 30,
      },
      {
        phase: "closingImpact",
        visualStateBefore: "closing",
        commandHex: "a9056400",
        playbackId: 56,
        sampleId: 32,
      },
    ],
  );
  assert.match(
    evidence.runtimePhaseTrace.conclusion,
    /no opening-completion command/,
  );
  assert.deepEqual(evidence.audioBoundary.unresolved, []);
});
