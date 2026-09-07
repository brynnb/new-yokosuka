import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MARTIAL_ARTS_FOLLOWUP_STAGES,
  MARTIAL_ARTS_MOVES,
  MARTIAL_ARTS_STRINGS,
  MARTIAL_ARTS_STRING_STAGES,
  THROW_ACQUISITION_NEAR_DISTANCE,
} from "../src/MartialArtsCombat.js";

const evidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/combat-motion-manifest.json", import.meta.url),
));
const fightEvidence = JSON.parse(readFileSync(
  new URL("../tools/evidence/ryo-fight-bytecode.json", import.meta.url),
));

test("combat evidence inventories the Disc 3 fighting bank", () => {
  assert.equal(evidence.schema, "new-yokosuka-combat-evidence-v1");
  assert.equal(evidence.motionBank.sequenceCount, 513);
  assert.equal(evidence.motionBank.completeSequenceCount, 512);
  assert.equal(evidence.canonicalMoves.length, 51);
  assert.equal(
    Object.values(MARTIAL_ARTS_MOVES).filter(
      (move) => move.category === "hand",
    ).length,
    19,
  );
  assert.equal(
    Object.values(MARTIAL_ARTS_MOVES).filter(
      (move) => move.category === "leg",
    ).length,
    18,
  );
  assert.equal(
    Object.values(MARTIAL_ARTS_MOVES).filter(
      (move) => move.category === "throw",
    ).length,
    14,
  );
  assert.equal(evidence.enemyBattleFiles.length, 20);
  assert.ok(evidence.canonicalMoves.every(
    (move) => move.commandGlyphBytes.length >= 2,
  ));
  assert.equal(evidence.nativeCommandTables.compactRecordSize, 7);
  assert.deepEqual(evidence.nativeCommandTables.opcodeTokens, {
    0: "hand",
    1: "leg",
    2: "up",
    3: "down",
    4: "run",
    5: "throw",
    6: "guard",
    7: "plus",
  });
  assert.ok(evidence.canonicalMoves.every((move) => (
    move.compactCommandBytes.length === 7
    && move.compactCommandTokenCount === move.compactCommandOpcodes.length
    && move.commandTokens.length === move.compactCommandTokenCount
  )));
});

test("native command records preserve exact common and contextual inputs", () => {
  const move = (name) => evidence.canonicalMoves.find(
    (candidate) => candidate.name === name,
  );
  assert.deepEqual(move("Tiger Knuckle").commandTokens, ["hand"]);
  assert.deepEqual(move("Elbow Slam").commandTokens, ["up", "hand"]);
  assert.deepEqual(
    move("Shadow Reaper").commandTokens,
    ["run", "guard", "plus", "leg"],
  );
  assert.deepEqual(move("DarksideHazuki").commandTokens, ["throw"]);
  assert.deepEqual(
    move("DarksideHazuki").displayCommandTokens,
    ["position:b1f8", "throw"],
  );
  assert.equal(
    move("DarksideHazuki").commandDecoding,
    "engine-command-with-separate-positional-display-condition",
  );
});

test("every configured Ryo move uses its exact native global motion", () => {
  const fightSequenceByName = new Map(evidence.motionBank.sequences.map(
    (sequence) => [sequence.name, sequence],
  ));
  const canonicalByName = new Map(evidence.canonicalMoves.map(
    (move) => [move.name, move],
  ));
  const stance = fightSequenceByName.get("YKI_AKI_KAMAE1_LP");
  assert.ok(stance, "battle stance animation is present");
  assert.equal(stance.complete, true);
  for (const move of Object.values(MARTIAL_ARTS_MOVES)) {
    const canonicalName = move.canonicalName || move.label;
    const canonical = canonicalByName.get(canonicalName);
    assert.ok(canonical, `${canonicalName} native move is present`);
    assert.equal(move.nativePrimaryAnimation, canonical.primaryMotion.name);
    assert.equal(
      move.nativePrimaryDuration,
      canonical.primaryMotion.durationFrames,
    );
    assert.equal(
      move.highProficiencyAnimation,
      canonical.highProficiencyMotion?.name || null,
    );
    assert.equal(
      move.highProficiencyDuration,
      canonical.highProficiencyMotion?.durationFrames || null,
    );
    if (move.enemyAnimation) {
      const enemyAnimation = fightSequenceByName.get(move.enemyAnimation);
      assert.ok(enemyAnimation, `${move.id} enemy animation is present`);
      assert.equal(enemyAnimation.complete, true);
    }
    if (move.victimAnimation) {
      assert.equal(move.victimAnimation, canonical.victimMotion?.name);
      assert.equal(canonical.victimMotion.complete, true);
      assert.equal(
        move.victimDuration,
        canonical.victimMotion.durationFrames,
      );
      assert.equal(
        move.highProficiencyVictimAnimation,
        canonical.highProficiencyVictimMotion?.name || null,
      );
      assert.equal(
        move.highProficiencyVictimDuration,
        canonical.highProficiencyVictimMotion?.durationFrames || null,
      );
    }
  }
});

test("global motion metadata exposes native phase frames for 44 moves", () => {
  const direct = evidence.canonicalMoves.filter(
    (move) => move.primaryMotion.directHitPhaseFrames,
  );
  assert.equal(direct.length, 44);
  for (const move of direct) {
    const frames = move.primaryMotion.directHitPhaseFrames;
    assert.equal(frames.length, 3, move.name);
    assert.ok(frames[0] <= frames[1], move.name);
    assert.ok(frames[1] <= frames[2], move.name);
    assert.ok(move.primaryMotion.actionMetadataOffset > 0, move.name);
  }
  const move = (name) => evidence.canonicalMoves.find(
    (candidate) => candidate.name === name,
  );
  assert.deepEqual(
    move("Tiger Knuckle").primaryMotion.directHitPhaseFrames,
    [4, 5, 13],
  );
  assert.deepEqual(
    move("Crescent Kick").primaryMotion.directHitPhaseFrames,
    [6, 8, 22],
  );

  const directStrikes = direct.filter(
    (move) => move.category !== "throw",
  );
  assert.equal(directStrikes.length, 32);
  for (const canonical of directStrikes) {
    const configured = Object.values(MARTIAL_ARTS_MOVES).find(
      (move) => (move.canonicalName || move.label) === canonical.name,
    );
    assert.deepEqual(
      configured.nativeAuthoredPhaseFrames,
      canonical.primaryMotion.directHitPhaseFrames,
      canonical.name,
    );
  }
});

test("combat motion metadata exposes native DTPK sound cues by frame", () => {
  const battleCues = evidence.motionBank.sequences.flatMap(
    (sequence) => sequence.nativeSoundCues,
  );
  assert.ok(battleCues.length > 400);
  assert.ok(battleCues.every((cue) => (
    cue.operation === 0x04
    && cue.operationFamily === 0x05
    && cue.commandClass === 0xab
    && cue.commandHex === `ab${cue.group.toString(16).padStart(2, "0")}${
      cue.track.toString(16).padStart(2, "0")
    }00`
    && cue.rawBytes.length === 8
  )));

  const canonicalCues = evidence.canonicalMoves.flatMap(
    (move) => move.primaryMotion.nativeSoundCues,
  );
  assert.ok(canonicalCues.length > 0);
  assert.ok(canonicalCues.some((cue) => cue.group === 0x76));
  assert.ok(canonicalCues.every((cue) => cue.frame >= 0));
});

test("direct strike metadata exposes native authored damage parameters", () => {
  const directStrikes = evidence.canonicalMoves.filter(
    (move) => (
      move.category !== "throw"
      && move.primaryMotion.directHitPhaseFrames
    ),
  );
  assert.equal(directStrikes.length, 32);
  for (const move of directStrikes) {
    const parameters = move.primaryMotion.directAttackParameters;
    assert.ok(parameters, move.name);
    assert.equal(parameters.rawBytes.length, 20, move.name);
    assert.equal(parameters.rawBytes[0], 0x04, move.name);
    assert.equal(parameters.rawBytes[1], parameters.attackClassIndex, move.name);
    assert.equal(parameters.rawBytes[2], parameters.proficiencySelector, move.name);
    assert.equal(parameters.rawBytes[3], parameters.baseDamage, move.name);
    assert.ok(parameters.baseDamage > 0, move.name);
    const configured = Object.values(MARTIAL_ARTS_MOVES).find(
      (candidate) => (candidate.canonicalName || candidate.label) === move.name,
    );
    assert.deepEqual(
      configured.nativeAttackParameters,
      {
        attackClassIndex: parameters.attackClassIndex,
        proficiencySelector: parameters.proficiencySelector,
        baseDamage: parameters.baseDamage,
      },
      move.name,
    );
    assert.equal(
      configured.nativeAuthoredBaseDamage,
      parameters.baseDamage,
      move.name,
    );
  }
  const move = (name) => evidence.canonicalMoves.find(
    (candidate) => candidate.name === name,
  );
  assert.deepEqual(
    {
      attackClassIndex:
        move("Tiger Knuckle").primaryMotion.directAttackParameters.attackClassIndex,
      proficiencySelector:
        move("Tiger Knuckle").primaryMotion.directAttackParameters.proficiencySelector,
      baseDamage:
        move("Tiger Knuckle").primaryMotion.directAttackParameters.baseDamage,
    },
    {
      attackClassIndex: 5,
      proficiencySelector: 0,
      baseDamage: 4,
    },
  );
  assert.equal(
    move("Crescent Kick").primaryMotion.directAttackParameters.baseDamage,
    6,
  );
});

test("embedded setup streams expose Double Blow and Dark Moon hit metadata", () => {
  const move = (name) => evidence.canonicalMoves.find(
    (candidate) => candidate.name === name,
  );
  const expected = new Map([
    ["Double Blow", {
      frames: [7, 9, 22],
      parameters: [15, 0, 30],
    }],
    ["Dark Moon", {
      frames: [14, 16, 48],
      parameters: [15, 3, 25],
    }],
  ]);
  const embedded = evidence.canonicalMoves.filter(
    (candidate) => candidate.primaryMotion.embeddedHitPhaseFrames,
  );
  assert.deepEqual(embedded.map(({ name }) => name), [...expected.keys()]);
  for (const [name, source] of expected) {
    const canonical = move(name);
    const parameters = canonical.primaryMotion.embeddedAttackParameters;
    const configured = Object.values(MARTIAL_ARTS_MOVES).find(
      (candidate) => (candidate.canonicalName || candidate.label) === name,
    );
    assert.deepEqual(
      canonical.primaryMotion.embeddedHitPhaseFrames,
      source.frames,
    );
    assert.deepEqual(
      [
        parameters.attackClassIndex,
        parameters.proficiencySelector,
        parameters.baseDamage,
      ],
      source.parameters,
    );
    assert.deepEqual(configured.nativeAuthoredPhaseFrames, source.frames);
    assert.equal(configured.nativeAuthoredBaseDamage, source.parameters[2]);
  }
});

test("configured labels use names found in the original game's catalogue", () => {
  const names = new Set(evidence.canonicalMoves.map((move) => move.name));
  for (const move of Object.values(MARTIAL_ARTS_MOVES)) {
    const canonicalName = move.canonicalName || move.label;
    assert.ok(
      names.has(canonicalName),
      `${canonicalName} is native catalogue text`,
    );
  }
});

test("all ten configured strings follow EN_RYOU's exact motion requests", () => {
  assert.deepEqual(
    Object.keys(fightEvidence.verifiedStrings).sort(),
    MARTIAL_ARTS_STRINGS.map(({ id }) => id).sort(),
  );
  for (const string of MARTIAL_ARTS_STRINGS) {
    const extracted = fightEvidence.verifiedStrings[string.id];
    assert.deepEqual(extracted.input, string.input, `${string.id} input`);
    const baseAnimation = string.input[0] === "hand"
      ? MARTIAL_ARTS_MOVES.tigerKnuckle.animation
      : MARTIAL_ARTS_MOVES.crescentKick.animation;
    const configuredAnimations = [
      baseAnimation,
      ...string.stageIds
        .slice(1)
        .filter(Boolean)
        .map((stageId) => MARTIAL_ARTS_STRING_STAGES[stageId].animation),
    ];
    assert.deepEqual(
      configuredAnimations,
      extracted.stages.map(({ sequence }) => sequence.name),
      `${string.id} animation path`,
    );
  }
});

test("throw acquisition stages match both native B-path requests", () => {
  const throwPath = fightEvidence.verifiedPaths.throwAcquisition;
  const extracted = throwPath.rangeBranches;
  assert.equal(throwPath.distanceDiscriminator.opcode, 0x1b);
  assert.equal(throwPath.distanceDiscriminator.fileOffset, 0x0e4c);
  assert.equal(throwPath.distanceDiscriminator.rawFixed16_16, 0x00016666);
  assert.equal(
    THROW_ACQUISITION_NEAR_DISTANCE,
    throwPath.distanceDiscriminator.distance,
  );
  for (const [stageId, branch] of [
    ["throwAcquireNear", extracted[0]],
    ["throwAcquireLong", extracted[1]],
  ]) {
    const configured = MARTIAL_ARTS_FOLLOWUP_STAGES[stageId];
    assert.equal(configured.animation, branch.sequence.name);
    assert.equal(configured.duration, branch.sequence.durationFrames);
    assert.equal(configured.damage, 0);
    assert.equal(configured.active, 0);
  }
});

test("Arm Break Fire follow-ups match EN_RYOU and paired global motions", () => {
  const chain = evidence.nativeFollowupChains.armBreakFire;
  assert.equal(chain.label, "Arm Break Fire");
  assert.deepEqual(chain.nativeMoveDefinitionFlags, [8192, 0]);
  assert.deepEqual(
    chain.stages.map((stage) => stage.id),
    [
      "armBreakFire",
      "armBreakChestStrike",
      "armBreakFireFinish",
    ],
  );
  for (const stageId of [
    "armBreakChestStrike",
    "armBreakFireFinish",
  ]) {
    const configured = MARTIAL_ARTS_FOLLOWUP_STAGES[stageId];
    const extracted = chain.stages.find((stage) => stage.id === stageId);
    assert.equal(configured.animation, extracted.actorMotion.name);
    assert.equal(configured.duration, extracted.actorMotion.durationFrames);
    assert.equal(configured.victimAnimation, extracted.victimMotion.name);
    assert.equal(
      configured.victimDuration,
      extracted.victimMotion.durationFrames,
    );
    assert.equal(extracted.actorMotion.complete, true);
    assert.equal(extracted.victimMotion.complete, true);
  }
});

test("Tornado Kick stages retain its native entry and catalogue finisher", () => {
  const chain = evidence.nativeFollowupChains.tornadoKick;
  assert.deepEqual(
    chain.stages.map((stage) => [
      stage.id,
      stage.actorMotion.name,
      stage.actorMotion.durationFrames,
    ]),
    [
      ["tornadoKick", "AKI_AKI_BAT_KICK_NIREN1_TOP", 40],
      [
        "tornadoKickFinish",
        "AKI_AKI_BAT_KICK_NIREN1_TOP_MK",
        64,
      ],
    ],
  );
  assert.equal(
    MARTIAL_ARTS_MOVES.tornadoKick.animation,
    chain.stages[0].actorMotion.name,
  );
  const finish = MARTIAL_ARTS_FOLLOWUP_STAGES.tornadoKickFinish;
  assert.equal(finish.animation, chain.stages[1].actorMotion.name);
  assert.equal(finish.duration, chain.stages[1].actorMotion.durationFrames);
  assert.equal(
    chain.observedAlternateRequest.name,
    "AKI_AKI_BAT_KICK_NIREN2_TOP",
  );
  assert.equal(chain.observedAlternateRequest.bytecodeOffset, 0x075c);
});

test("Pit Blow elbow uses its confirmed EN_RYOU continuation", () => {
  const chain = evidence.nativeFollowupChains.pitBlow;
  const elbow = chain.stages.find((stage) => stage.id === "pitBlowElbow");
  assert.equal(chain.minimumProficiency, 56);
  assert.equal(elbow.actorMotion.bytecodeOffset, 0x0884);
  assert.equal(elbow.actorMotion.name, "AKI_AKI_KONGO_TYUKEN_C_MID");
  assert.equal(
    MARTIAL_ARTS_FOLLOWUP_STAGES.pitBlowElbow.animation,
    elbow.actorMotion.name,
  );
  assert.equal(
    MARTIAL_ARTS_FOLLOWUP_STAGES.pitBlowElbow.duration,
    elbow.actorMotion.durationFrames,
  );
  assert.deepEqual(
    chain.observedAlternates.map((motion) => motion.name),
    [
      "AKI_AKI_KONGO_TYUKEN_B_MID",
      "AKI_AKI_KONGO_TYUKEN_Y_B_MID",
    ],
  );
});

test("Swallow Flip uses its native intercept, flip, and ground-strike family", () => {
  const chain = evidence.nativeFollowupChains.swallowFlip;
  assert.deepEqual(chain.nativeMoveDefinitionFlags, [0, 16448]);
  assert.deepEqual(
    chain.stages.map((stage) => [
      stage.id,
      stage.actorMotion.name,
      stage.victimMotion.name,
    ]),
    [
      [
        "swallowFlip",
        "AKI_AKI_NGS_INASI",
        "YKI_AKI_NGR_INASI",
      ],
      [
        "swallowFlipThrow",
        "AKI_AKI_NGS_ENSEI_MK",
        "YKI_AKI_NGR_ENSEI",
      ],
      [
        "swallowFlipPunch",
        "AKI_AKI_NGS_ENSEI_PNC",
        "YKI_AKI_NGR_ENSEI_PNC",
      ],
    ],
  );
  assert.equal(chain.stages[0].actorMotion.bytecodeOffset, 0x036c);
  assert.equal(chain.stages[1].victimMotion.bytecodeOffset, 0x0344);
  assert.equal(
    MARTIAL_ARTS_MOVES.swallowFlip.animation,
    chain.stages[0].actorMotion.name,
  );
  assert.equal(
    MARTIAL_ARTS_MOVES.swallowFlip.victimAnimation,
    chain.stages[0].victimMotion.name,
  );
  for (const stageId of ["swallowFlipThrow", "swallowFlipPunch"]) {
    const configured = MARTIAL_ARTS_FOLLOWUP_STAGES[stageId];
    const extracted = chain.stages.find((stage) => stage.id === stageId);
    assert.equal(configured.animation, extracted.actorMotion.name);
    assert.equal(configured.duration, extracted.actorMotion.durationFrames);
    assert.equal(configured.victimAnimation, extracted.victimMotion.name);
    assert.equal(
      configured.victimDuration,
      extracted.victimMotion.durationFrames,
    );
  }
  assert.deepEqual(
    [
      chain.observedAlternatePair.actorMotion.name,
      chain.observedAlternatePair.victimMotion.name,
    ],
    [
      "AKI_AKI_NGS_ENSEI_KKT",
      "YKI_AKI_NGR_ENSEI_KKT",
    ],
  );
});

test("Cross Charge retains its native paired counter semantics", () => {
  const extracted = evidence.canonicalMoves.find(
    (move) => move.name === "Cross Charge",
  );
  const configured = MARTIAL_ARTS_MOVES.crossCharge;
  assert.match(extracted.description, /evades an opponent's attack/i);
  assert.equal(configured.counterCondition, "incoming-strike");
  assert.equal(configured.kind, "counter");
  assert.equal(configured.animation, extracted.primaryMotion.name);
  assert.equal(configured.duration, extracted.primaryMotion.durationFrames);
  assert.equal(configured.victimAnimation, extracted.victimMotion.name);
  assert.equal(configured.victimDuration, extracted.victimMotion.durationFrames);
});

test("Shadow Step and Shadow Blade retain their oncoming-blow semantics", () => {
  const extractedByName = new Map(evidence.canonicalMoves.map(
    (move) => [move.name, move],
  ));
  for (const [id, name] of [
    ["shadowStep", "Shadow Step"],
    ["shadowBlade", "Shadow Blade"],
  ]) {
    const configured = MARTIAL_ARTS_MOVES[id];
    const extracted = extractedByName.get(name);
    assert.equal(configured.kind, "counter");
    assert.equal(configured.counterCondition, "incoming-strike");
    assert.equal(configured.animation, extracted.primaryMotion.name);
  }
  assert.match(
    extractedByName.get("Shadow Step").description,
    /evasion of an opponent's attack/i,
  );
  assert.match(
    extractedByName.get("Shadow Blade").description,
    /extension of the Shadow Step/i,
  );
});
