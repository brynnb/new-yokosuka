#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import { parseMt7 } from "../../src/Mt7Parser.js";
import {
  runShenmue2AnimationConformance,
} from "../lib/Shenmue2AnimationConformance.js";

function parseArguments(argv) {
  const options = {
    coverage: "tools/evidence/shenmue2-animation-coverage.json",
    output: "tools/evidence/shenmue2-animation-family-conformance.json",
    strict: false,
    check: false,
    workerFixture: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") options.strict = true;
    else if (argument === "--check") options.check = true;
    else if (argument === "--coverage") options.coverage = argv[++index];
    else if (argument === "--out") options.output = argv[++index];
    else if (argument === "--worker-fixture") {
      options.workerFixture = argv[++index];
    }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}

function familySafeSummary(report) {
  const pointErrors = report.frames.flatMap((frame) => (
    Object.values(frame.pointErrors)
  ));
  const orientationErrors = report.frames.flatMap((frame) => (
    Object.values(frame.orientationErrors)
  ));
  const bendErrors = report.frames.flatMap((frame) => (
    Object.values(frame.limbs).map(({ bendErrorDegrees }) => bendErrorDegrees)
  ));
  const lengthErrors = report.frames.flatMap((frame) => (
    Object.values(frame.limbs).flatMap(({ lengthErrors }) => lengthErrors)
  ));
  return {
    maximumPelvisPositionError: maximum(report.frames.map(
      ({ foundation }) => foundation.pelvisPositionError,
    )),
    maximumPelvisOrientationErrorDegrees: maximum(report.frames.map(
      ({ foundation }) => foundation.pelvisOrientationErrorDegrees,
    )),
    maximumHorizontalRootDrift: maximum(report.frames.map(
      ({ foundation }) => foundation.browserHorizontalRootDrift,
    )),
    maximumPointError: maximum(pointErrors),
    maximumOrientationErrorDegrees: maximum(orientationErrors),
    maximumBendErrorDegrees: maximum(bendErrors),
    maximumLengthError: maximum(lengthErrors),
  };
}

function familySafeFailures(summary, thresholds) {
  const checks = [
    ["maximumPelvisPositionError", "maximumPelvisPositionError"],
    [
      "maximumPelvisOrientationErrorDegrees",
      "maximumPelvisOrientationErrorDegrees",
    ],
    ["maximumHorizontalRootDrift", "maximumHorizontalRootDrift"],
    [
      "maximumPointError",
      "maximumPointError",
    ],
    ["maximumOrientationErrorDegrees", "maximumOrientationErrorDegrees"],
    ["maximumBendErrorDegrees", "maximumBendErrorDegrees"],
    ["maximumLengthError", "maximumLengthError"],
  ];
  return checks.flatMap(([metric, thresholdMetric]) => (
    summary[metric] > thresholds[thresholdMetric]
      ? [{ metric, actual: summary[metric], threshold: thresholds[thresholdMetric] }]
      : []
  ));
}

const authoredRootScaleCache = new Map();
function authoredRootScale(modelFile) {
  const resolved = path.resolve(modelFile);
  if (authoredRootScaleCache.has(resolved)) {
    return authoredRootScaleCache.get(resolved);
  }
  const rootScale = parseMt7(fs.readFileSync(resolved)).nodes[0]?.scale;
  if (
    !Array.isArray(rootScale)
    || rootScale.length !== 3
    || !rootScale.every(Number.isFinite)
    || rootScale.some((value) => value <= 0)
    || Math.max(...rootScale) - Math.min(...rootScale) > 1e-6
  ) {
    throw new Error(`S2 family model has no uniform authored root scale: ${modelFile}`);
  }
  const scale = rootScale[0];
  authoredRootScaleCache.set(resolved, scale);
  return scale;
}

function familyScaleBinding(fixture, modelFile) {
  const referenceRootScale = authoredRootScale(fixture.modelFile);
  const candidateRootScale = authoredRootScale(modelFile);
  const referenceActorScale = fixture.actorScale ?? 1;
  const referenceMotionTranslationScale =
    fixture.motionTranslationScale ?? 1;
  const actorScale = (
    referenceActorScale * referenceRootScale / candidateRootScale
  );
  const motionTranslationScale = (
    referenceMotionTranslationScale * referenceActorScale / actorScale
  );
  return {
    referenceRootScale,
    candidateRootScale,
    actorScale,
    motionTranslationScale,
    evidence: (
      "The MT7 root's authored uniform scale multiplies limb geometry, while "
      + "the external actor scale multiplies both geometry and compact-root "
      + "translation. Preserve their native world products when replaying a "
      + "fixture against another exact CHRM."
    ),
  };
}

function runMode(
  fixture,
  modelFile,
  scaleBinding,
  useCapturedEvaluatedCurveValues,
) {
  // Conformance treats fixtures as immutable. A deep clone duplicated every
  // captured matrix/curve frame for every model/mode pair and pushed the
  // expanded native corpus beyond V8's 4 GiB heap. Only modelFile differs for
  // a family replay, so retain the shared evidence arrays by reference.
  const candidate = {
    ...fixture,
    modelFile,
    actorScale: scaleBinding.actorScale,
    motionTranslationScale: scaleBinding.motionTranslationScale,
  };
  const report = runShenmue2AnimationConformance(candidate, {
    repositoryRoot: process.cwd(),
    useCapturedEvaluatedCurveValues,
  });
  const summary = familySafeSummary(report);
  return {
    summary,
    failures: familySafeFailures(summary, report.thresholds),
  };
}

const options = parseArguments(process.argv.slice(2));
const coverage = JSON.parse(fs.readFileSync(options.coverage, "utf8"));
const strictProfiles = new Map(coverage.nativeRestProfileCoverage
  .filter(({ status }) => status === "strict-native")
  .map((profile) => [profile.restProfile, profile]));
const fixtures = coverage.fixtures.filter((fixture) => (
  fixture.status === "strict-native" && strictProfiles.has(fixture.restProfile)
));
function evaluateFixtures(selectedFixtures) {
  const result = [];
  for (const fixtureSummary of selectedFixtures) {
    const fixture = JSON.parse(fs.readFileSync(fixtureSummary.file, "utf8"));
    const referenceModelCode = path.basename(fixture.modelFile, ".CHRM");
    const reducedRendererFixture = (
      fixture.provenance?.poseMatrices?.permittedDirectControllerOffsets
        ?.length > 0
    );
    const compatibleModels = reducedRendererFixture
      ? [referenceModelCode]
      : strictProfiles.get(fixtureSummary.restProfile).availableModelCodes;
    for (const modelCode of compatibleModels) {
      const modelFile = `play/assets/shenmue2-characters/${modelCode}.CHRM`;
      try {
        const scaleBinding = familyScaleBinding(fixture, modelFile);
        result.push({
          restProfile: fixtureSummary.restProfile,
          modelCode,
          referenceFixtureId: fixtureSummary.id,
          referenceModelCode,
          motionId: fixtureSummary.motionId,
          motionCategories: fixtureSummary.motionCategories,
          frameCount: fixtureSummary.frameCount,
          scaleBinding,
          capturedInputs: runMode(fixture, modelFile, scaleBinding, true),
          decodedMotion: runMode(fixture, modelFile, scaleBinding, false),
        });
      } catch (error) {
        result.push({
          restProfile: fixtureSummary.restProfile,
          modelCode,
          referenceFixtureId: fixtureSummary.id,
          referenceModelCode,
          motionId: fixtureSummary.motionId,
          motionCategories: fixtureSummary.motionCategories,
          frameCount: fixtureSummary.frameCount,
          error: error.stack || error.message,
        });
      }
    }
  }
  return result;
}

if (options.workerFixture) {
  const selected = fixtures.filter(({ id }) => id === options.workerFixture);
  if (selected.length !== 1) {
    throw new Error(`Unknown strict fixture ${options.workerFixture}`);
  }
  process.stdout.write(JSON.stringify(evaluateFixtures(selected)));
  process.exit(0);
}

// Babylon disposes each NullEngine/scene, but its process-wide caches still
// make a long whole-corpus replay grow beyond Node's default heap. Run one
// reference fixture per worker so each bounded group releases all native and
// JavaScript state at process exit. The parent retains only compact summaries.
const observations = fixtures.flatMap((fixture) => {
  const worker = childProcess.spawnSync(process.execPath, [
    process.argv[1],
    "--coverage", options.coverage,
    "--worker-fixture", fixture.id,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (worker.status !== 0) {
    return [{
      restProfile: fixture.restProfile,
      referenceFixtureId: fixture.id,
      motionId: fixture.motionId,
      motionCategories: fixture.motionCategories,
      frameCount: fixture.frameCount,
      error: (worker.stderr || worker.stdout || (
        `family worker exited ${worker.status}`
      )).trim(),
    }];
  }
  return JSON.parse(worker.stdout);
});

const failedObservations = observations.filter((observation) => (
  observation.error
  || observation.capturedInputs.failures.length
  || observation.decodedMotion.failures.length
));
const representedModels = new Set(observations.map(({ modelCode }) => modelCode));
const representedProfiles = new Set(observations.map(
  ({ restProfile }) => restProfile,
));
const representedMotions = new Set(observations.map(({ motionId }) => motionId));
const representedCategories = new Set(observations.flatMap(
  ({ motionCategories }) => motionCategories,
));
const report = {
  schema: "new-yokosuka-shenmue2-animation-family-conformance-v1",
  evidenceBoundary: (
    "Each observation replays an exact synchronized native fixture against "
    + "every bundled CHRM assigned to the same SH-4 rest-record family. "
    + "Pelvis, head, limb, and orientation outputs are family-level native "
    + "invariants. Head translation follows the two rest-record segments at "
    + "+0x14/+0x28 with controller 11 applied between them; standalone MDC7 "
    + "head attachment lengths are not solver inputs. "
    + "Cross-model replay preserves the product of each CHRM's authored MT7 "
    + "root scale and its external actor scale, plus the corresponding "
    + "world compact-root translation; this is necessary for native models "
    + "authored at 1.0 rather than the common 0.1 root scale. "
    + "A reduced-renderer fixture is replayed only against its exact model "
    + "because absence of its two MDC7 arm-root records is a model topology "
    + "property, not a rest-family invariant. The reduced model can still "
    + "replay full-renderer references after authored scale normalization. "
    + "This extends direct native evidence across compatible models, but does "
    + "not replace an exact-model capture for unrepresented families."
  ),
  excludedComparisons: [],
  fixtureReuseRestrictions: [{
    fixtureProperty: "provenance.poseMatrices.permittedDirectControllerOffsets",
    scope: "exact model only",
    reason: (
      "Reduced MDC7 hierarchies omit renderer bindings for two intermediate "
      + "arm roots; their matrices are synchronized controller evidence, but "
      + "that omission must not be projected onto full family models."
    ),
  }],
  summary: {
    representedRestProfileCount: representedProfiles.size,
    representedModelCount: representedModels.size,
    nativeReferenceFixtureCount: fixtures.length,
    representedPrimaryMotionCount: representedMotions.size,
    representedMotionCategoryCount: representedCategories.size,
    modelFixtureObservationCount: observations.length,
    evaluatedModeCount: observations.length * 2,
    failedObservationCount: failedObservations.length,
    unrepresentedRestProfileCount: (
      coverage.summary.availableCharacterRestProfileCount
      - representedProfiles.size
    ),
    unrepresentedModelCount: (
      coverage.summary.availableCharacterModelCount - representedModels.size
    ),
  },
  representedRestProfiles: [...representedProfiles].sort(),
  representedMotionCategories: [...representedCategories].sort(),
  missingNativeProfileCaptureTargets:
    coverage.missingNativeProfileCaptureTargets,
  observations,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (options.check) {
  const existing = fs.existsSync(options.output)
    ? fs.readFileSync(options.output, "utf8")
    : null;
  if (existing !== serialized) {
    console.error(`${options.output} is stale; regenerate the family corpus.`);
    process.exitCode = 1;
  }
} else {
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, serialized);
}

console.error(
  `S2 family corpus: ${representedModels.size} models, ${fixtures.length} native fixtures, `
  + `${observations.length} model/fixture observations, ${failedObservations.length} failures.`,
);
if (options.strict && failedObservations.length) process.exitCode = 1;
