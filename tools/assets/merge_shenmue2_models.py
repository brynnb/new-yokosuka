#!/usr/bin/env python3
"""Combine staged discs into one publishable viewer library without merging scenes."""

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path


def merge_models(inputs, output):
    roots = [Path(root).resolve() for root in inputs]
    output = Path(output).resolve()
    if len(set(roots)) != len(roots):
        raise ValueError("input staging directories must be distinct")
    if any(root == output or root in output.parents or output in root.parents for root in roots):
        raise ValueError("output must be separate from input staging directories")
    output.parent.mkdir(parents=True, exist_ok=True)
    models, textures, viewer_models, sources = [], [], [], []
    summary = {}
    entry_points = {}
    with tempfile.TemporaryDirectory(prefix="shenmue2-library-", dir=output.parent) as temporary:
        staging = Path(temporary)
        for kind in ("models", "textures"):
            (staging / kind).mkdir()
        for root in roots:
            manifest = json.loads((root / "models.json").read_text())
            viewer = json.loads((root / "viewer-models.json").read_text())
            if manifest.get("schema") != "new-yokosuka-shenmue2-models-v1":
                raise ValueError(f"unsupported staging manifest: {root}")
            if viewer.get("schema") != "new-yokosuka-shenmue2-viewer-models-v1":
                raise ValueError(f"unsupported viewer manifest: {root}")
            if [m["filename"] for m in manifest["models"]] != [m["filename"] for m in viewer["models"]]:
                raise ValueError(f"viewer/forensic manifest mismatch: {root}")
            pack_names = {pack["filename"] for pack in manifest["texturePacks"]}
            for model in manifest["models"]:
                if model.get("texturePack") and model["texturePack"] not in pack_names:
                    raise ValueError(f"missing texture pack for {model['filename']}")
            for kind, records in (("models", manifest["models"]), ("textures", manifest["texturePacks"])):
                for record in records:
                    name = record["filename"]
                    if Path(name).name != name or name in (".", ".."):
                        raise ValueError(f"invalid asset filename: {name}")
                    destination = staging / kind / name
                    if destination.exists():
                        raise ValueError(f"duplicate asset filename: {name}; use distinct disc namespaces")
                    source = root / kind / name
                    if source.stat().st_size != record["byteLength"] or hashlib.sha256(source.read_bytes()).hexdigest() != record["sha256"]:
                        raise ValueError(f"staged asset does not match its manifest: {source}")
                    shutil.copy2(source, destination)
            models.extend(manifest["models"])
            textures.extend(manifest["texturePacks"])
            viewer_models.extend(viewer["models"])
            for key, poses in viewer.get("entryPoints", {}).items():
                if key in entry_points:
                    raise ValueError(f"duplicate entry-point area: {key}")
                entry_points[key] = poses
            sources.append({"namespace": manifest["namespace"], "root": str(root)})
            for key, value in manifest["summary"].items():
                summary[key] = summary.get(key, 0) + value
        (staging / "models.json").write_text(json.dumps({
            "schema": "new-yokosuka-shenmue2-models-v1", "namespace": "S2DC",
            "sources": sources, "summary": summary, "models": models, "texturePacks": textures,
            "entryPoints": entry_points,
        }, indent=2) + "\n")
        (staging / "viewer-models.json").write_text(json.dumps({
            "schema": "new-yokosuka-shenmue2-viewer-models-v1", "namespace": "S2DC",
            "summary": summary, "models": viewer_models, "entryPoints": entry_points,
        }, indent=2) + "\n")
        if output.exists():
            shutil.rmtree(output)
        shutil.move(staging, output)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(merge_models(args.inputs, args.out), indent=2))
