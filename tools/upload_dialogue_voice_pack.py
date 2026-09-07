#!/usr/bin/env python3
"""Upload a generated dialogue voice pack to Cloudflare R2."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import threading
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        os.environ.setdefault(
            key.strip(),
            value.strip().strip("\"").strip("'"),
        )


def require_s3_client(env_file: Path | None):
    if env_file is not None:
        load_env_file(env_file)
    try:
        import boto3
    except ImportError as error:
        raise RuntimeError(
            "boto3 is required: python3 -m pip install --user boto3"
        ) from error
    required = (
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_ENDPOINT",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "missing R2 environment values: " + ", ".join(missing)
        )
    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )


def object_matches(
    client,
    *,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
    cache_control: str,
) -> bool:
    try:
        result = client.head_object(Bucket=bucket, Key=key)
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise
    return (
        result.get("ContentLength") == path.stat().st_size
        and result.get("ContentType") == content_type
        and result.get("CacheControl") == cache_control
    )


def put_object(
    client,
    *,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
    cache_control: str,
    overwrite: bool = False,
) -> str:
    if not overwrite and object_matches(
        client,
        bucket=bucket,
        key=key,
        path=path,
        content_type=content_type,
        cache_control=cache_control,
    ):
        return "skipped"
    with path.open("rb") as source:
        client.upload_fileobj(
            source,
            bucket,
            key,
            ExtraArgs={
                "ContentType": content_type,
                "CacheControl": cache_control,
            },
        )
    return "uploaded"


def worker_request(
    worker_url: str,
    *,
    method: str,
    key: str,
    path: Path | None = None,
    content_type: str | None = None,
    cache_control: str | None = None,
):
    headers = {"x-r2-object-key": key}
    data = None
    if path is not None:
        data = path.read_bytes()
        headers["content-type"] = content_type or "application/octet-stream"
        if cache_control:
            headers["cache-control"] = cache_control
    request = Request(
        worker_url.rstrip("/") + "/object",
        data=data,
        headers=headers,
        method=method,
    )
    for attempt in range(5):
        try:
            return urlopen(request, timeout=120)
        except HTTPError as error:
            if method == "HEAD" and error.code == 404:
                return None
            if error.code < 500 or attempt == 4:
                raise
        except (TimeoutError, URLError):
            if attempt == 4:
                raise
        time.sleep(0.5 * (2**attempt))
    raise RuntimeError("unreachable upload retry state")


def put_object_through_worker(
    worker_url: str,
    *,
    key: str,
    path: Path,
    content_type: str,
    cache_control: str,
    overwrite: bool = False,
) -> str:
    head = None if overwrite else worker_request(
        worker_url,
        method="HEAD",
        key=key,
    )
    if not overwrite and head is not None:
        remote_length = int(head.headers.get("content-length", "-1"))
        if (
            remote_length == path.stat().st_size
            and head.headers.get("content-type") == content_type
            and head.headers.get("cache-control") == cache_control
        ):
            return "skipped"
    response = worker_request(
        worker_url,
        method="PUT",
        key=key,
        path=path,
        content_type=content_type,
        cache_control=cache_control,
    )
    if response.status != 201:
        raise RuntimeError(f"upload returned HTTP {response.status}")
    return "uploaded"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--bucket", default="newyokosuka")
    parser.add_argument("--prefix", default="dialogue/voices/v1")
    parser.add_argument("--env-file", type=Path)
    parser.add_argument(
        "--worker-url",
        help="local Wrangler upload bridge URL instead of S3 credentials",
    )
    parser.add_argument("--jobs", type=int, default=16)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="upload every object without resumable HEAD checks",
    )
    args = parser.parse_args()

    if args.jobs <= 0:
        parser.error("--jobs must be positive")
    manifest: dict[str, Any] = json.loads(args.manifest.read_text())
    expected_files = {
        Path(line["url"]).name for line in manifest.get("lines", [])
    }
    audio_files = {
        path.name: path for path in args.audio_dir.glob("*.m4a")
    }
    missing = expected_files.difference(audio_files)
    if missing:
        parser.error(
            f"audio directory is missing {len(missing)} manifest files"
        )
    audio_tasks = [
        (
            audio_files[name],
            f"{args.prefix.rstrip('/')}/{name}",
            "audio/mp4",
            "public, max-age=31536000, immutable",
        )
        for name in sorted(expected_files)
    ]
    manifest_task = (
        args.manifest,
        f"{args.prefix.rstrip('/')}/manifest.json",
        "application/json; charset=utf-8",
        "public, max-age=300",
    )
    tasks = [*audio_tasks, manifest_task]
    total_bytes = sum(path.stat().st_size for path, *_ in tasks)
    print(
        f"Prepared {len(tasks):,} R2 objects "
        f"({total_bytes / 1024 / 1024:.1f} MiB)"
    )
    if args.dry_run:
        return 0

    client = None if args.worker_url else require_s3_client(args.env_file)
    counts = {"uploaded": 0, "skipped": 0, "failed": 0}
    lock = threading.Lock()

    def upload(task):
        path, key, content_type, cache_control = task
        if args.worker_url:
            return put_object_through_worker(
                args.worker_url,
                key=key,
                path=path,
                content_type=content_type,
                cache_control=cache_control,
                overwrite=args.overwrite,
            )
        return put_object(
            client,
            bucket=args.bucket,
            key=key,
            path=path,
            content_type=content_type,
            cache_control=cache_control,
            overwrite=args.overwrite,
        )

    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = {
            executor.submit(upload, task): task for task in audio_tasks
        }
        for completed, future in enumerate(as_completed(futures), 1):
            task = futures[future]
            try:
                result = future.result()
            except Exception as error:
                with lock:
                    counts["failed"] += 1
                print(f"\nFailed {task[1]}: {error}")
            else:
                with lock:
                    counts[result] += 1
            if completed % 100 == 0 or completed == len(audio_tasks):
                print(
                    f"\rUploaded {completed}/{len(tasks)} "
                    f"(new: {counts['uploaded']}, "
                    f"skipped: {counts['skipped']}, "
                    f"failed: {counts['failed']})",
                    end="",
                    flush=True,
                )
    if counts["failed"]:
        print("\nManifest was not published because audio uploads failed.")
        return 1

    try:
        result = upload(manifest_task)
    except Exception as error:
        counts["failed"] += 1
        print(f"\nFailed {manifest_task[1]}: {error}")
        return 1
    counts[result] += 1
    print(
        f"\rUploaded {len(tasks)}/{len(tasks)} "
        f"(new: {counts['uploaded']}, "
        f"skipped: {counts['skipped']}, "
        f"failed: {counts['failed']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
