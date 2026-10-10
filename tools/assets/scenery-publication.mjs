import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {WORLDS} from '../../play/config/worlds.js';
import {preparedSceneryKey, preparedScenerySpec, PREPARED_SCENERY_WORLDS} from '../../play/world/PreparedSceneryPlan.js';
import {SCENERY_BUNDLE_SCHEMA} from '../../src/rendering/PreparedSceneryBundle.js';
import {SCENERY_CATALOG_SCHEMA, sceneryAssetKey} from '../../src/rendering/SceneryAssetCatalog.js';
import {auditFixedSceneryPlacements} from './scenery-placement-policy.js';
import {ScheduledSceneObjectCatalog} from '../../play/world/ScheduledSceneObjectCatalog.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalogFile = 'play/data/scenery-bundles.generated.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const definitionFiles = ['play/config/worlds.js', 'play/world/PreparedSceneryPlan.js',
  'play/world/Shenmue2SceneRecords.js', 'play/cutscenes/IntroductionEnvironments.js',
  'src/SceneCompositions.js', 'tools/assets/scenery-placement-policy.js'];
const definitionHashes = repositoryRoot => Object.fromEntries(definitionFiles.map(file =>
  [file, hash(fs.readFileSync(path.join(repositoryRoot, file)))]));

// Clean CI clones need no extracted binaries to prove the catalog still pins
// today's ownership inputs. Payload verification happens before publication.
export function checkSceneryCatalog(repositoryRoot = root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(repositoryRoot, catalogFile)));
  if (catalog.schema !== SCENERY_CATALOG_SCHEMA) throw new Error('Invalid scenery catalog');
  if (JSON.stringify(catalog.definitionHashes) !== JSON.stringify(definitionHashes(repositoryRoot))) {
    throw new Error('Scenery preparation definitions changed; register rebuilt bundles');
  }
  const expected = [...new Set(PREPARED_SCENERY_WORLDS.map(id => preparedSceneryKey(WORLDS[id])))].sort();
  if (JSON.stringify(Object.keys(catalog.bundles).sort()) !== JSON.stringify(expected)) throw new Error('Scenery catalog coverage changed; register rebuilt bundles');
  for (const [key, entry] of Object.entries(catalog.bundles)) {
    sceneryAssetKey(key, 'world.json', entry.manifest);
    sceneryAssetKey(key, 'world.bin', entry.binary);
    for (const [file, expectedHash] of Object.entries(entry.policyHashes)) {
      if (hash(fs.readFileSync(path.join(repositoryRoot, file))) !== expectedHash) throw new Error(`Scenery ownership input changed: ${file}; rebuild and register bundles`);
    }
  }
  console.log(`Checked ${expected.length} build-pinned scenery records without extracted payloads`);
  return catalog;
}

export function buildSceneryUploadPlan(repositoryRoot = root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(repositoryRoot, catalogFile)));
  if (catalog.schema !== SCENERY_CATALOG_SCHEMA) throw new Error('Invalid scenery publication catalog');
  return Object.entries(catalog.bundles).flatMap(([key, entry]) => ['world.bin', 'world.json'].map(filename => {
    const record = filename === 'world.bin' ? entry.binary : entry.manifest;
    const sourcePath = path.join(repositoryRoot, '.disc-work/scenery-bundle', key, filename);
    const bytes = fs.readFileSync(sourcePath);
    if (bytes.length !== record.size || hash(bytes) !== record.sha256) throw new Error(`Unregistered scenery change: ${key}/${filename}`);
    // Transfer compression preserves decoded checksums and geometry. Keep it
    // separate from editable local output and never overwrite a prior key.
    const filePath = path.join(repositoryRoot, '.disc-work/scenery-publication', key, `${filename}.gz`);
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    let compressed = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    if (!compressed || hash(gunzipSync(compressed)) !== record.sha256) {
      compressed = gzipSync(bytes, {level: 6});
      fs.writeFileSync(filePath, compressed);
    }
    return {game: 'scenery', filePath, size: compressed.length, decodedSize: record.size,
      key: sceneryAssetKey(key, filename, record), kind: 'asset', phase: 'content',
      contentType: filename.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=31536000, immutable'};
  }));
}

export function registerScenery(repositoryRoot = root) {
  const catalog = {schema: SCENERY_CATALOG_SCHEMA, definitionHashes: definitionHashes(repositoryRoot), bundles: {}};
  const keys = [...new Set(PREPARED_SCENERY_WORLDS.map(id => preparedSceneryKey(WORLDS[id])))].sort();
  for (const key of keys) {
    const world = WORLDS[key];
    const directory = path.join(repositoryRoot, '.disc-work/scenery-bundle', key);
    const manifestBytes = fs.readFileSync(path.join(directory, 'world.json'));
    const binary = fs.readFileSync(path.join(directory, 'world.bin'));
    const manifest = JSON.parse(manifestBytes);
    if (manifest.schema !== SCENERY_BUNDLE_SCHEMA || manifest.provenance.key !== key
      || manifest.binaryBytes !== binary.length || manifest.binaryHash !== hash(binary)) throw new Error(`Invalid scenery bundle: ${key}`);
    // The bundle's selected records suffice to reconstruct the current contract.
    // This checks today's gameplay definitions without trusting directory names.
    const files = world.assetFormat === 'MT7' ? {models: manifest.provenance.contract.records}
      : manifest.provenance.contract.filenames;
    const spec = preparedScenerySpec(world, files);
    if (JSON.stringify(spec.contract) !== JSON.stringify(manifest.provenance.contract)) throw new Error(`Stale scenery contract: ${key}`);
    const policyHashes = {}, documents = [];
    for (const file of spec.policyFiles) {
      const bytes = fs.readFileSync(path.join(repositoryRoot, file));
      policyHashes[file] = hash(bytes);
      if (manifest.provenance.sources.find(row => row.file === file)?.hash !== policyHashes[file]) throw new Error(`Stale scenery policy: ${file}`);
      documents.push(JSON.parse(bytes));
    }
    if (documents.length) {
      const [, scheduled, fixtures] = documents;
      const audit = auditFixedSceneryPlacements(world.placements,
        new ScheduledSceneObjectCatalog(scheduled).definitions(world.id), fixtures);
      if (JSON.stringify(audit) !== JSON.stringify(manifest.provenance.placements)) throw new Error(`Stale scenery ownership: ${key}`);
    }
    catalog.bundles[key] = {manifest: {sha256: hash(manifestBytes), size: manifestBytes.length},
      binary: {sha256: manifest.binaryHash, size: binary.length}, policyHashes};
  }
  fs.writeFileSync(path.join(repositoryRoot, catalogFile), JSON.stringify(catalog, null, 2)+'\n');
  console.log(`Registered ${keys.length} verified scenery bundles`);
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'register') registerScenery();
  else if (process.argv[2] === 'check') checkSceneryCatalog();
  else throw new Error('Usage: node tools/assets/scenery-publication.mjs <register|check>');
}
