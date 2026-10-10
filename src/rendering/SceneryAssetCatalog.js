import {R2_URL} from '../constants.js';

export const SCENERY_CATALOG_SCHEMA = 'new-yokosuka-scenery-catalog-v1';

export function sceneryAssetKey(key, filename, record) {
  if (!/^[a-z0-9]+$/.test(key) || !['world.json', 'world.bin'].includes(filename)
    || !/^[a-f0-9]{64}$/.test(record?.sha256) || !Number.isSafeInteger(record.size) || record.size <= 0) {
    throw new Error(`Invalid published scenery record: ${key}/${filename}`);
  }
  return `shenmue/scenery/${record.sha256}/${key}/${filename}`;
}

export function sceneryAssetUrl(key, filename, record, baseUrl = R2_URL) {
  return `${baseUrl.replace(/\/$/, '')}/${sceneryAssetKey(key, filename, record)}`;
}
