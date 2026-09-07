#!/usr/bin/env python3
"""Extract proven gameplay effects from dialogue-bearing native event code.

The source event IR remains the authority for control flow.  This tool does
not flatten branches into an execution order or guess the meaning of runtime
operands.  It emits effect templates at their exact function, block, and call
offsets, and marks whether every operand needed by the browser adapter is
already statically resolved.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-gameplay-effects.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-gameplay-effects.json"
)

STATE_BANK_WRITES = {
    12: (2, "bit"),
    14: (3, "bit"),
    16: (4, "byte"),
}

EFFECT_SEMANTICS = {
    "actor-lnwk-control": ("actorPresentation", "scene"),
    "actor-look-point-control": ("actorPresentation", "scene"),
    "actor-look-point-update-control": ("actorPresentation", "scene"),
    "actor-mhnd-controller-request": ("actorPresentation", "scene"),
    "actor-controller-word-7c-write": ("actorState", "scene"),
    "actor-osag-node-byte-and-flag-set": ("actorState", "scene"),
    "actor-momt-flag-bit-0": ("actorState", "scene"),
    "actor-momt-float-pair-write": ("actorState", "scene"),
    "actor-momt-mask-control": ("actorState", "scene"),
    "actor-face-clip-control-write": ("actorState", "scene"),
    "actor-motion-request": ("actorPresentation", "scene"),
    "camera-state-mode-select": ("camera", "scene"),
    "event-camera-request": ("camera", "scene"),
    "global-byte-state-write": ("runtimeState", "scene"),
    "fixed-global-byte-0c201fe0-write": ("runtimeState", "scene"),
    "native-game-state-byte-control": ("nativeControl", "scene"),
    "hmdl-transform": ("objectTransform", "scene"),
    "map-transition": ("transition", "immediate"),
    "named-resource-residency-control": ("resourceResidency", "scene"),
    "native-operation-0166-control": ("nativeControl", "scene"),
    "native-operation-0120-record-field-control": (
        "fixedRecordState",
        "scene",
    ),
    "native-operation-001c-packed-word-query": ("nativeControl", "scene"),
    "native-operation-008f-object-orchestration": ("nativeControl", "scene"),
    "native-operation-019f-momt-flag-24-control": (
        "actorState",
        "scene",
    ),
    "native-operation-0194-control": ("nativeControl", "scene"),
    "numbered-map-layer-state": ("mapLayerState", "scene"),
    "persistent-yen-write": ("economy", "server"),
    "primary-runtime-state-transition": ("runtimeState", "scene"),
    "primary-runtime-extended-operation": ("runtimeState", "scene"),
    "global-runtime-word-bit-5-control": ("runtimeState", "scene"),
    "global-runtime-controller-reset": ("runtimeState", "scene"),
    "global-runtime-controller-byte-selection": ("runtimeState", "scene"),
    "resolved-object-presentation-flag": ("objectState", "scene"),
    "resolved-object-face-record-request": ("associatedRecord", "scene"),
    "resolved-object-fixo-attachment-install": ("associatedRecord", "scene"),
    "resolved-object-fixo-reset": ("associatedRecord", "scene"),
    "resolved-object-face-record-parameter-write": (
        "associatedRecord",
        "scene",
    ),
    "resolved-object-base-vector-query": ("objectTransform", "scene"),
    "resolved-object-ccow-mask-control": ("associatedRecord", "scene"),
    "resolved-object-dword-5c-bit-6-control": ("objectState", "scene"),
    "resolved-object-hndl-hndr-controller-request": (
        "associatedRecord",
        "scene",
    ),
    "resolved-object-hndl-hndr-component-write": (
        "associatedRecord",
        "scene",
    ),
    "resolved-object-hndl-hndr-vector-install": (
        "associatedRecord",
        "scene",
    ),
    "resolved-object-indexed-vector-query": ("objectTransform", "scene"),
    "resolved-object-link-field-zero-write": ("objectTransform", "scene"),
    "resolved-object-runtime-flag": ("objectState", "scene"),
    "resolved-object-xz-bounds-query": ("objectTransform", "scene"),
    "resolved-object-vector-initialize": ("objectTransform", "scene"),
    "resolved-object-vector-operation": ("objectTransform", "scene"),
    "scene-eight-channel-transition-write": ("sceneTransition", "scene"),
    "sound-command-dispatch": ("audio", "scene"),
    "tagged-object-action": ("objectAction", "scene"),
}


def constant(argument: dict[str, Any] | None) -> Any | None:
    if not argument or argument.get("kind") != "constant":
        return None
    return argument.get("value")


def operand(argument: dict[str, Any] | None) -> dict[str, Any]:
    if not argument:
        return {"kind": "missing"}
    result = {"kind": argument.get("kind", "unresolved")}
    for key in ("value", "hex", "ascii", "source"):
        if key in argument:
            result[key] = argument[key]
    return result


def source_for(
    disc: int,
    area: str,
    function: dict[str, Any],
    block: dict[str, Any],
    action: dict[str, Any],
) -> dict[str, Any]:
    return {
        "disc": disc,
        "area": area,
        "functionOffset": function["id"],
        "blockOffset": block["id"],
        "callOffset": action["callFileOffset"],
        "operation": action["operationHex"],
    }


def normalized_effect(
    action: dict[str, Any],
    source: dict[str, Any],
) -> dict[str, Any] | None:
    semantic = action.get("semanticId")
    arguments = action.get("arguments", [])

    if semantic == "native-free-conversation-control":
        subcommand = constant(arguments[0] if arguments else None)
        definition = STATE_BANK_WRITES.get(subcommand)
        if not definition:
            return None
        bank, storage = definition
        return {
            "kind": "stateBankWrite",
            "persistence": "character",
            "bank": bank,
            "storage": storage,
            "index": operand(arguments[1] if len(arguments) > 1 else None),
            "value": operand(arguments[2] if len(arguments) > 2 else None),
            "source": source,
        }

    if semantic == "game-state-access":
        subcommand = constant(arguments[0] if arguments else None)
        if subcommand != 0x41:
            return None
        return {
            "kind": "actorByteStateWrite",
            "persistence": "character",
            "actor": operand(arguments[1] if len(arguments) > 1 else None),
            "value": operand(arguments[2] if len(arguments) > 2 else None),
            "source": source,
        }

    if semantic == "numbered-map-layer-state":
        return {
            "kind": "mapLayerState",
            "persistence": "scene",
            "layer": operand(arguments[0] if arguments else None),
            "value": operand(arguments[1] if len(arguments) > 1 else None),
            "source": source,
        }

    if semantic == "resolved-object-runtime-flag":
        return {
            "kind": "objectRuntimeFlag",
            "persistence": "scene",
            "object": operand(arguments[0] if arguments else None),
            "mode": operand(arguments[1] if len(arguments) > 1 else None),
            "source": source,
        }

    if semantic == "resolved-object-presentation-flag":
        return {
            "kind": "objectPresentationFlag",
            "persistence": "scene",
            "object": operand(arguments[0] if arguments else None),
            "mode": operand(arguments[1] if len(arguments) > 1 else None),
            "source": source,
        }

    if semantic == "map-transition":
        return {
            "kind": "mapTransition",
            "persistence": "immediate",
            "scene": operand(arguments[0] if arguments else None),
            "area": operand(arguments[1] if len(arguments) > 1 else None),
            "entry": operand(arguments[2] if len(arguments) > 2 else None),
            "source": source,
        }

    if semantic == "global-byte-state-write":
        return {
            "kind": "globalByteStateWrite",
            "persistence": "scene",
            "value": operand(arguments[0] if arguments else None),
            "source": source,
        }

    classification = EFFECT_SEMANTICS.get(semantic)
    if not classification:
        return None
    effect_class, persistence = classification
    return {
        "kind": "nativeOperation",
        "semanticId": semantic,
        "effectClass": effect_class,
        "persistence": persistence,
        "arguments": [operand(argument) for argument in arguments],
        "source": source,
    }


def required_operands(effect: dict[str, Any]) -> list[dict[str, Any]]:
    kind = effect["kind"]
    if kind == "stateBankWrite":
        return [effect["index"], effect["value"]]
    if kind == "actorByteStateWrite":
        return [effect["actor"], effect["value"]]
    if kind == "mapLayerState":
        return [effect["layer"], effect["value"]]
    if kind in ("objectRuntimeFlag", "objectPresentationFlag"):
        return [effect["object"], effect["mode"]]
    if kind == "mapTransition":
        return [effect["scene"], effect["area"], effect["entry"]]
    if kind == "globalByteStateWrite":
        return [effect["value"]]
    return effect.get("arguments", [])


def resolution(effect: dict[str, Any]) -> str:
    operands = required_operands(effect)
    if operands and all(item.get("kind") == "constant" for item in operands):
        return "static"
    return "runtime-bound"


def build_report(event_ir: dict[str, Any]) -> dict[str, Any]:
    maps = []
    kind_counts: Counter[str] = Counter()
    semantic_counts: Counter[str] = Counter()
    resolution_counts: Counter[str] = Counter()
    persistence_counts: Counter[str] = Counter()
    area_counts: dict[str, Counter[str]] = defaultdict(Counter)
    unique_bank_targets: dict[int, set[int]] = defaultdict(set)
    unresolved_operation_counts: Counter[str] = Counter()
    constrained_family_counts: Counter[str] = Counter()
    state_bank_targets: dict[tuple[int, int], dict[str, Any]] = {}
    map_layer_targets: dict[int, dict[str, Any]] = {}
    transition_targets: dict[tuple[int, str, int], dict[str, Any]] = {}
    dialogue_function_count = 0
    effect_function_count = 0

    for source_map in event_ir["maps"]:
        functions = []
        for function in source_map["functions"]:
            dialogue_region = function.get("dialogueRegion")
            if not dialogue_region:
                continue
            dialogue_function_count += 1
            blocks = []
            for block in function["blocks"]:
                effects = []
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("adapterStatus") != "proven"
                    ):
                        unresolved_operation_counts[
                            action["operationHex"]
                        ] += 1
                        families = action.get("knownOperationFamilies")
                        if families is None and action.get(
                            "knownOperationFamily"
                        ):
                            families = [action["knownOperationFamily"]]
                        for family in families or []:
                            constrained_family_counts[family] += 1
                    if action.get("adapterStatus") != "proven":
                        continue
                    source = source_for(
                        source_map["disc"],
                        source_map["area"],
                        function,
                        block,
                        action,
                    )
                    effect = normalized_effect(action, source)
                    if not effect:
                        continue
                    effect["resolution"] = resolution(effect)
                    effects.append(effect)
                    kind_counts[effect["kind"]] += 1
                    semantic_counts[action["semanticId"]] += 1
                    resolution_counts[effect["resolution"]] += 1
                    persistence_counts[effect["persistence"]] += 1
                    area_counts[source_map["area"]][effect["kind"]] += 1
                    if (
                        effect["kind"] == "stateBankWrite"
                        and effect["index"].get("kind") == "constant"
                    ):
                        bank = effect["bank"]
                        index = effect["index"]["value"]
                        value = constant(effect["value"])
                        unique_bank_targets[bank].add(index)
                        target = state_bank_targets.setdefault(
                            (bank, index),
                            {
                                "bank": bank,
                                "index": index,
                                "writeCount": 0,
                                "values": set(),
                                "areas": set(),
                                "voiceIds": set(),
                            },
                        )
                        target["writeCount"] += 1
                        if value is not None:
                            target["values"].add(value)
                        target["areas"].add(source_map["area"])
                        target["voiceIds"].update(
                            dialogue_region.get("voiceIds", []),
                        )
                    elif (
                        effect["kind"] == "mapLayerState"
                        and effect["layer"].get("kind") == "constant"
                    ):
                        layer = effect["layer"]["value"]
                        target = map_layer_targets.setdefault(
                            layer,
                            {
                                "layer": layer,
                                "writeCount": 0,
                                "values": set(),
                                "areas": set(),
                            },
                        )
                        target["writeCount"] += 1
                        value = constant(effect["value"])
                        if value is not None:
                            target["values"].add(value)
                        target["areas"].add(source_map["area"])
                    elif effect["kind"] == "mapTransition":
                        scene = constant(effect["scene"])
                        area = effect["area"].get("ascii")
                        entry = constant(effect["entry"])
                        if (
                            scene is not None
                            and isinstance(area, str)
                            and entry is not None
                        ):
                            target = transition_targets.setdefault(
                                (scene, area, entry),
                                {
                                    "scene": scene,
                                    "area": area,
                                    "entry": entry,
                                    "requestCount": 0,
                                    "sourceAreas": set(),
                                    "voiceIds": set(),
                                },
                            )
                            target["requestCount"] += 1
                            target["sourceAreas"].add(source_map["area"])
                            target["voiceIds"].update(
                                dialogue_region.get("voiceIds", []),
                            )
                if effects:
                    blocks.append({
                        "id": block["id"],
                        "successors": block["successors"],
                        "terminator": block.get("terminator"),
                        "effects": effects,
                    })
            if blocks:
                effect_function_count += 1
                functions.append({
                    "id": function["id"],
                    "entryBlock": function["entryBlock"],
                    "dialogueRegion": dialogue_region,
                    "blocks": blocks,
                    "unresolvedControlTransfers": (
                        function["unresolvedControlTransfers"]
                    ),
                })
        if functions:
            maps.append({
                "disc": source_map["disc"],
                "area": source_map["area"],
                "mapinfoSha256": source_map["mapinfoSha256"],
                "functions": functions,
            })

    summary = {
        "mapCount": len(maps),
        "dialogueFunctionCount": dialogue_function_count,
        "effectFunctionCount": effect_function_count,
        "effectCount": sum(kind_counts.values()),
        "effectKindCounts": dict(sorted(kind_counts.items())),
        "semanticCounts": dict(sorted(semantic_counts.items())),
        "resolutionCounts": dict(sorted(resolution_counts.items())),
        "persistenceCounts": dict(sorted(persistence_counts.items())),
        "uniqueStateBankTargets": {
            str(bank): len(indices)
            for bank, indices in sorted(unique_bank_targets.items())
        },
        "unresolvedOperationCounts": dict(
            unresolved_operation_counts.most_common(),
        ),
        "knownFamilyButUnresolvedCounts": dict(
            constrained_family_counts.most_common(),
        ),
        "stateBankTargetInventory": [
            {
                **target,
                "values": sorted(target["values"]),
                "areas": sorted(target["areas"]),
                "voiceIds": sorted(target["voiceIds"]),
            }
            for _, target in sorted(state_bank_targets.items())
        ],
        "mapLayerTargetInventory": [
            {
                **target,
                "values": sorted(target["values"]),
                "areas": sorted(target["areas"]),
            }
            for _, target in sorted(map_layer_targets.items())
        ],
        "transitionDestinationInventory": [
            {
                **target,
                "sourceAreas": sorted(target["sourceAreas"]),
                "voiceIds": sorted(target["voiceIds"]),
            }
            for _, target in sorted(transition_targets.items())
        ],
        "areaEffectCounts": {
            area: dict(sorted(counts.items()))
            for area, counts in sorted(area_counts.items())
        },
    }
    return {
        "schema": "new-yokosuka-dialogue-gameplay-effects-v1",
        "evidenceBoundary": [
            "Only functions carrying an independently recovered dialogueRegion are included.",
            "Only operations with a proven semantic adapter in native-event-ir are considered.",
            "Effects retain native function, block, call, operation, and control-flow provenance.",
            "Runtime operands remain runtime-bound; they are never replaced with guessed constants.",
            "The catalog is not a flattened execution trace and must be interpreted through its native control flow.",
        ],
        "summary": summary,
        "maps": maps,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "new-yokosuka-dialogue-gameplay-effects-summary-v1",
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "fullReport": ".disc-work/dialogue/dialogue-gameplay-effects.json",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=DEFAULT_SUMMARY,
    )
    args = parser.parse_args()
    report = build_report(json.loads(args.event_ir.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary_report(report), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: {report['summary']['effectCount']} effects "
        f"in {report['summary']['effectFunctionCount']} dialogue functions"
    )


if __name__ == "__main__":
    main()
