import fs from "node:fs";

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function contentType(item) {
  if (item.contentType) return item.contentType;
  return item.kind === "catalog"
    ? "application/json; charset=utf-8"
    : "application/octet-stream";
}

function cacheControl(item) {
  if (item.cacheControl) return item.cacheControl;
  return item.kind === "catalog"
    ? "no-cache"
    : "public, max-age=3600, must-revalidate";
}

function isNotFound(error) {
  return error?.$metadata?.httpStatusCode === 404
    || error?.name === "NotFound"
    || error?.name === "NoSuchKey";
}

export class S3AssetUploadTransport {
  constructor(configuration) {
    this.bucket = configuration.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: configuration.endpoint,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async head(key) {
    try {
      const object = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return { size: object.ContentLength, sha256: object.Metadata?.sha256 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async put(item, sha256) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: item.key,
      Body: fs.createReadStream(item.filePath),
      ContentLength: item.size,
      ContentType: contentType(item),
      CacheControl: cacheControl(item),
      Metadata: { sha256 },
    }));
  }
}

export class WorkerAssetUploadTransport {
  constructor(workerUrl, { requestTimeoutMs = 120000 } = {}) {
    this.workerUrl = workerUrl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(key, options) {
    const maximumAttempts = 5;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await fetch(this.workerUrl, {
          ...options,
          // A dropped bridge connection can otherwise stall a worker forever.
          // PUTs are idempotent; retry the same key and checksum on timeout.
          signal: AbortSignal.timeout(this.requestTimeoutMs),
          headers: { ...options.headers, "x-r2-object-key": key },
        });
        if (response.ok || response.status === 404) return response;
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`R2 upload bridge returned ${response.status}`);
        }
        if (attempt === maximumAttempts) {
          throw new Error(`R2 upload bridge returned ${response.status} after ${maximumAttempts} attempts`);
        }
      } catch (error) {
        if (attempt === maximumAttempts || error.message.includes("returned 4")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
    }
    throw new Error("R2 upload bridge retry loop ended unexpectedly");
  }

  async head(key) {
    const response = await this.request(key, { method: "HEAD" });
    if (response.status === 404) return null;
    return {
      size: Number(response.headers.get("content-length")),
      sha256: response.headers.get("x-r2-sha256") || undefined,
    };
  }

  async put(item, sha256) {
    await this.request(item.key, {
      method: "PUT",
      body: await fs.promises.readFile(item.filePath),
      headers: {
        "content-type": contentType(item),
        "cache-control": cacheControl(item),
        "x-r2-sha256": sha256,
      },
    });
  }
}
