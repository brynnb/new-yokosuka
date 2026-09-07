import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimePlan, validateSourcePath } from "../runtime-assets.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PREFIX = "shenmue";
const DEFAULT_CONCURRENCY = 4;

export function usage() {
  return `Publish extracted Shenmue assets to Cloudflare R2.

Usage:
  npm run upload:assets -- --game <s1|s2|all|runtime> [options]

Options:
  --game <value>       Asset library to publish (required)
  --s1-root <path>     Directory containing models/ and models.json
                       (default: public/)
  --s2-root <path>     Directory containing models/, textures/, and
                       viewer-models.json (default: SHENMUE2_MODEL_PATH or
                       .disc-work/shenmue2-disc1-models)
  --prefix <key>       R2 key prefix (default: shenmue)
  --concurrency <n>    Simultaneous R2 requests (default: 4)
  --worker-url <url>   Use an authenticated local R2 upload bridge instead of
                       S3 credentials
  --source-prefix <path> Limit runtime uploads to one repository-relative directory
  --request-timeout-ms <n> Bridge request timeout (default: 120000)
  --dry-run            Validate sources and print the complete local plan
                       without requiring credentials or contacting R2
  --force              Upload every selected object without checking R2
  --help               Show this message

Environment:
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME

Files are never deleted from R2. Content files are completed before either
catalog is published, so clients cannot discover partially uploaded releases.`;
}

export function parseArguments(argv) {
  const options = {
    game: null,
    s1Root: path.join(repositoryRoot, "public"),
    s2Root: process.env.SHENMUE2_MODEL_PATH
      ? path.resolve(process.env.SHENMUE2_MODEL_PATH)
      : path.join(repositoryRoot, ".disc-work/shenmue2-disc1-models"),
    prefix: DEFAULT_PREFIX,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    force: false,
    help: false,
    workerUrl: null,
  };
  const valueOptions = new Map([
    ["--game", "game"],
    ["--s1-root", "s1Root"],
    ["--s2-root", "s2Root"],
    ["--prefix", "prefix"],
    ["--concurrency", "concurrency"],
    ["--worker-url", "workerUrl"],
    ["--source-prefix", "sourcePrefix"],
    ["--request-timeout-ms", "requestTimeoutMs"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--force") {
      options[argument === "--dry-run" ? "dryRun" : "force"] = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const optionName = valueOptions.get(argument);
    if (!optionName) throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[optionName] = value;
    index += 1;
  }

  if (options.help) return options;
  if (!new Set(["s1", "s2", "all", "runtime"]).has(options.game)) {
    throw new Error("--game must be s1, s2, all, or runtime");
  }
  options.s1Root = path.resolve(options.s1Root);
  options.s2Root = path.resolve(options.s2Root);
  options.prefix = normalizePrefix(options.prefix);
  if (options.workerUrl) options.workerUrl = new URL(options.workerUrl).href;
  options.requestTimeoutMs = Number(options.requestTimeoutMs ?? 120000);
  if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs < 1000 || options.requestTimeoutMs > 600000) {
    throw new Error("--request-timeout-ms must be from 1000 through 600000");
  }
  if (options.sourcePrefix) {
    if (options.game !== "runtime") throw new Error("--source-prefix requires --game runtime");
    options.sourcePrefix = options.sourcePrefix.replace(/\/$/, "");
    validateSourcePath(`${options.sourcePrefix}/asset`);
  }
  options.concurrency = Number(options.concurrency);
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 32) {
    throw new Error("--concurrency must be an integer from 1 through 32");
  }
  return options;
}

function normalizePrefix(value) {
  const prefix = String(value).replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").some((part) => part === "..")) {
    throw new Error("--prefix must be a safe, non-empty R2 key prefix");
  }
  return prefix;
}

function requireDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`${label} directory not found: ${directory}`);
  }
}

function requireFile(filename, label) {
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    throw new Error(`${label} file not found: ${filename}`);
  }
}

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function task(game, filePath, key, kind, phase = "content") {
  return { game, filePath, key, kind, phase, size: fs.statSync(filePath).size };
}

export function buildShenmue1Plan(root, prefix = DEFAULT_PREFIX) {
  const modelsDirectory = path.join(root, "models");
  const catalogPath = path.join(root, "models.json");
  requireDirectory(modelsDirectory, "Shenmue I models");
  requireFile(catalogPath, "Shenmue I catalog");
  JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  const content = filesIn(modelsDirectory).map((filename) => task(
    "s1", path.join(modelsDirectory, filename), `${prefix}/${filename}`, "asset",
  ));
  if (content.length === 0) throw new Error(`No Shenmue I assets found in ${modelsDirectory}`);
  return [...content, task("s1", catalogPath, `${prefix}/models.json`, "catalog", "catalog")];
}

export function buildShenmue2Plan(root, prefix = DEFAULT_PREFIX) {
  const modelsDirectory = path.join(root, "models");
  const texturesDirectory = path.join(root, "textures");
  const catalogPath = path.join(root, "viewer-models.json");
  requireDirectory(modelsDirectory, "Shenmue II models");
  requireDirectory(texturesDirectory, "Shenmue II textures");
  requireFile(catalogPath, "Shenmue II deployment catalog");

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  if (!Array.isArray(catalog.models)) {
    throw new Error(`Shenmue II deployment catalog has no models array: ${catalogPath}`);
  }
  const modelFiles = filesIn(modelsDirectory);
  const textureFiles = filesIn(texturesDirectory);
  const modelNames = new Set(modelFiles);
  const textureNames = new Set(textureFiles);
  for (const entry of catalog.models) {
    if (!entry?.filename || !modelNames.has(entry.filename)) {
      throw new Error(`Shenmue II catalog references a missing model: ${entry?.filename ?? "<empty>"}`);
    }
    if (entry.texturePack && !textureNames.has(entry.texturePack)) {
      throw new Error(`Shenmue II catalog references a missing texture pack: ${entry.texturePack}`);
    }
  }

  const baseKey = `${prefix}/shenmue2`;
  const content = [
    ...modelFiles.map((filename) => task(
      "s2", path.join(modelsDirectory, filename), `${baseKey}/models/${filename}`, "model",
    )),
    ...textureFiles.map((filename) => task(
      "s2", path.join(texturesDirectory, filename), `${baseKey}/textures/${filename}`, "texture",
    )),
  ];
  if (content.length === 0) throw new Error(`No Shenmue II assets found in ${root}`);
  return [...content, task("s2", catalogPath, `${baseKey}/models.json`, "catalog", "catalog")];
}

export function buildUploadPlan(options) {
  if (options.game === "runtime") {
    const plan = buildRuntimePlan(repositoryRoot, { sourcePrefix: options.sourcePrefix });
    if (!plan.length) throw new Error("No runtime assets match the requested source prefix");
    return plan;
  }
  const plan = [];
  if (options.game === "s1" || options.game === "all") {
    plan.push(...buildShenmue1Plan(options.s1Root, options.prefix));
  }
  if (options.game === "s2" || options.game === "all") {
    plan.push(...buildShenmue2Plan(options.s2Root, options.prefix));
  }
  const keys = new Set();
  for (const item of plan) {
    if (keys.has(item.key)) throw new Error(`Duplicate R2 object key: ${item.key}`);
    keys.add(item.key);
  }
  return plan;
}
