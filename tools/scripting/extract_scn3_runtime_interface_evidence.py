#!/usr/bin/env python3
"""Prove the generated SCN3 r8 runtime-interface ABI and call families."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_CONTROL_FLOW = (
    PROJECT_ROOT
    / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/scn3-runtime-interface-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
ENTRY_THUNK_LENGTH = 38
ENTRY_THUNK_SHA256 = (
    "ddb0c40666ba92a203ed3a5e0fe3e4c65eefe8d2ec7113398639c575dc1a6fb5"
)

NATIVE_SLICES = {
    "runtimeInterfaceConstructor": (
        0x0C0BB124,
        130,
        "f43dd3d0f719b4f17ab8b6df5ee92cc8ace74a384bb0e97f0b0b0e0019d47871",
    ),
    "eventRecordRunner": (
        0x0C0BB550,
        246,
        "3e2edb8412f0c1a9cbf286e393fb6a6c121525b44c77d17d94ee0c250029d41b",
    ),
    "singleTargetSchedulerWrapper": (
        0x0C0BB6DA,
        36,
        "ed05487ff625b9810d2415a6849c61433da29c37ec2fbd1e738b2a3f37c7b18d",
    ),
    "resumableSchedulerWrapper": (
        0x0C0BB6A8,
        22,
        "786a7577f05c726b695feb424cc6d441762b39da74eb99a820abd2e5e17e7f75",
    ),
    "secondaryOperationWrapper": (
        0x0C0BB6BE,
        14,
        "72156bac00ed014a0ffb0106dbb03258675f7ec1d882bc44fc4e2571888cc11b",
    ),
    "continuationWriter": (
        0x0C0BB72A,
        66,
        "05e3dc20892c4d8c8b645ab5bf4b7ad612085672a31179a1f990f36204fcac5a",
    ),
    "schedulerSelectorZeroCountdownHandler": (
        0x0C16B47C,
        20,
        "771ee2c7bc9e28679218d1d82bc4edd6f05f3856e064e69a1eef651b02413eb6",
    ),
    "schedulerSelectorNineteenHandler": (
        0x0C16398E,
        40,
        "db09781f572a4a3023cb5caee411e27622b218476ec8b1593d2f57ee4862e08b",
    ),
    "schedulerGlobalReadinessQuery": (
        0x0C0E7C7C,
        60,
        "bfc7264eb960a106571dd44dfda8b53daaa17d751b56f7a05ce641ff477849e2",
    ),
    "secondaryOperationDispatcher": (
        0x0C160918,
        48,
        "9e0be555668022780e0216cb9d2f42c3b3ecdf0eeb34c3a364467394c89a1a90",
    ),
    "secondaryOperation5Handler": (
        0x0C15F3E8,
        68,
        "caceec750c9a113aa54b5e1e9c7d01c2ecc379742ffa27d2684547086cd5672f",
    ),
    "secondaryOperation1Handler": (
        0x0C15DD4C,
        322,
        "a0c6b8c022a0350cbc4d3be3240519b62b356e28ec62b74abf435bfb73bc21f0",
    ),
}

R8_SLOT_BEHAVIOR = {
    0x14: {
        "kind": "signed-integer-division",
        "nativeTarget": "0x0c1dc294",
    },
    0x18: {
        "kind": "signed-integer-remainder",
        "nativeTarget": "0x0c1dc440",
    },
    0x1C: {
        "kind": "single-target-scheduler-dispatch",
        "nativeTarget": "0x0c0bb6da",
    },
    0x2C: {
        "kind": "resumable-scheduler-dispatch",
        "nativeTarget": "0x0c0bb6a8",
    },
    0x30: {
        "kind": "secondary-operation-dispatch",
        "nativeTarget": "0x0c0bb6be",
    },
    0x3C: {
        "kind": "native-coroutine-save-continuation",
        "nativeTarget": "generated-entry-thunk-local-continuation",
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def runtime_call_inventory(
    control_flow: dict[str, Any],
) -> tuple[Counter[int], Counter[tuple[int, int]], int]:
    slots: Counter[int] = Counter()
    calls_by_map: list[dict[int, int]] = []
    dialogue_calls = 0
    for item in control_flow["maps"]:
        locations: dict[int, int] = {}
        for function in item["scriptedEventFunctions"]:
            in_dialogue = function.get("dialogueRegion") is not None
            for operation in function.get("secondaryNativeOperations", []):
                call_offset = int(operation["callFileOffset"], 16)
                slots[0x30] += 1
                locations[call_offset] = 0x30
                dialogue_calls += int(in_dialogue)
            for call in function.get("indirectCalls", []):
                source = call.get("targetSource")
                if (
                    source is None
                    or source.get("kind") != "base-register-slot"
                    or source.get("baseRegister") != "r8"
                ):
                    continue
                offset = source["byteOffset"]
                call_offset = int(call["callFileOffset"], 16)
                slots[offset] += 1
                locations[call_offset] = offset
                dialogue_calls += int(in_dialogue)
        calls_by_map.append(locations)

    pairs: Counter[tuple[int, int]] = Counter()
    for locations in calls_by_map:
        for call_offset, offset in locations.items():
            if offset == 0x1C and locations.get(call_offset + 6) == 0x3C:
                pairs[(0x1C, 0x3C)] += 1
            if offset == 0x2C and locations.get(call_offset + 12) == 0x3C:
                pairs[(0x2C, 0x3C)] += 1
    return slots, pairs, dialogue_calls


def scheduler_selector_zero_inventory(
    control_flow: dict[str, Any],
) -> tuple[Counter[str], Counter[int]]:
    argument_kinds: Counter[str] = Counter()
    frame_offsets: Counter[int] = Counter()
    for item in control_flow["maps"]:
        for function in item["scriptedEventFunctions"]:
            for call in function.get("indirectCalls", []):
                source = call.get("targetSource") or {}
                dispatch = call.get("runtimeDispatch") or {}
                if (
                    source.get("kind") != "base-register-slot"
                    or source.get("baseRegister") != "r8"
                    or source.get("byteOffset") != 0x2C
                    or dispatch.get("selector") != 0
                    or dispatch.get("argumentCount") != 1
                    or len(dispatch.get("arguments", [])) != 1
                    or call.get("resultBitTest", {}).get("mask") != 0x00010000
                ):
                    continue
                argument = dispatch["arguments"][0]
                kind = argument.get("kind", "missing")
                argument_kinds[kind] += 1
                if kind == "frame-field":
                    frame_offsets[argument["offset"]] += 1
    return argument_kinds, frame_offsets


def scheduler_selector_nineteen_inventory(
    control_flow: dict[str, Any],
) -> tuple[int, int, int]:
    calls = []
    for item in control_flow["maps"]:
        for function in item["scriptedEventFunctions"]:
            for call in function.get("indirectCalls", []):
                source = call.get("targetSource") or {}
                dispatch = call.get("runtimeDispatch") or {}
                if (
                    source.get("kind") == "base-register-slot"
                    and source.get("baseRegister") == "r8"
                    and source.get("byteOffset") == 0x2C
                    and dispatch.get("selector") == 19
                ):
                    calls.append((item, function, call))
    if any(
        dispatch.get("argumentCount") != 0
        or dispatch.get("arguments") != []
        or call.get("resultBitTest", {}).get("mask") != 0x00010000
        for _, _, call in calls
        for dispatch in [call.get("runtimeDispatch") or {}]
    ):
        raise ValueError("selector-nineteen scheduler ABI changed")
    return (
        len(calls),
        len({(item["disc"], item["area"]) for item, _, _ in calls}),
        sum(function.get("dialogueRegion") is not None for _, function, _ in calls),
    )


def browser_runtime_coverage(
    event_ir: dict[str, Any],
) -> tuple[Counter[str], Counter[str]]:
    proven: Counter[str] = Counter()
    unresolved: Counter[str] = Counter()
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") != "runtimeInterfaceCall":
                        continue
                    semantic_id = action.get("semanticId")
                    if (
                        action.get("behaviorStatus") == "proven"
                        and semantic_id
                    ):
                        proven[semantic_id] += 1
                    else:
                        unresolved[action["runtimeCallKind"]] += 1
    return proven, unresolved


def build_report(
    executable: bytes,
    control_flow: dict[str, Any],
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    slices = {}
    for name, (address, length, expected_hash) in NATIVE_SLICES.items():
        actual_hash = sha256(runtime_slice(executable, address, length))
        if actual_hash != expected_hash:
            raise ValueError(f"{name} native slice changed: {actual_hash}")
        slices[name] = {
            "address": f"0x{address:08x}",
            "length": length,
            "sha256": expected_hash,
        }

    thunk_hashes = Counter()
    executable_thunk_hashes = Counter()
    nonexecutable_maps = []
    for item in control_flow["maps"]:
        data = Path(item["source"]).read_bytes()
        start = int(item["scn3FileOffset"], 16) + 0x30
        thunk_hash = sha256(data[start:start + ENTRY_THUNK_LENGTH])
        thunk_hashes[thunk_hash] += 1
        if item["scriptedEventFunctions"]:
            executable_thunk_hashes[thunk_hash] += 1
        else:
            nonexecutable_maps.append({
                "disc": item["disc"],
                "area": item["area"],
                "initialFunctionFileOffset": (
                    item["initialFunctionFileOffset"]
                ),
                "entryThunkSha256": thunk_hash,
            })
    if executable_thunk_hashes != Counter({ENTRY_THUNK_SHA256: 119}):
        raise ValueError(
            "executable SCN3 entry thunk inventory changed: "
            f"{executable_thunk_hashes}"
        )
    if len(nonexecutable_maps) != 17 or sum(thunk_hashes.values()) != 136:
        raise ValueError(
            "all-map SCN3 thunk inventory changed: "
            f"{len(nonexecutable_maps)} nonexecutable of "
            f"{sum(thunk_hashes.values())}"
        )

    slots, pairs, dialogue_call_count = runtime_call_inventory(control_flow)
    scheduler_argument_kinds, scheduler_frame_offsets = (
        scheduler_selector_zero_inventory(control_flow)
    )
    selector_nineteen = scheduler_selector_nineteen_inventory(control_flow)
    if selector_nineteen != (16, 8, 6):
        raise ValueError(
            "selector-nineteen scheduler inventory changed: "
            f"{selector_nineteen}"
        )
    proven_browser_calls, unresolved_browser_calls = browser_runtime_coverage(
        event_ir
    )
    secondary_ids: Counter[int] = Counter()
    secondary_argument_counts: Counter[tuple[int, int]] = Counter()
    secondary_subcommands: Counter[tuple[int, int]] = Counter()
    for item in control_flow["maps"]:
        for function in item["scriptedEventFunctions"]:
            for operation in function.get("secondaryNativeOperations", []):
                operation_id = operation["operationId"]
                secondary_ids[operation_id] += 1
                secondary_argument_counts[(
                    operation_id,
                    len(operation["arguments"]),
                )] += 1
                arguments = operation["arguments"]
                if (
                    arguments
                    and arguments[0].get("kind") == "constant"
                ):
                    secondary_subcommands[(
                        operation_id,
                        arguments[0]["value"],
                    )] += 1
    expected_slots = Counter({
        0x14: 460,
        0x18: 113,
        0x1C: 200,
        0x2C: 28924,
        0x30: 2977,
        0x3C: 29124,
    })
    if slots != expected_slots:
        raise ValueError(f"r8 runtime slot inventory changed: {slots}")
    expected_pairs = Counter({
        (0x1C, 0x3C): 200,
        (0x2C, 0x3C): 28924,
    })
    if pairs != expected_pairs:
        raise ValueError(f"continuation pair inventory changed: {pairs}")
    expected_scheduler_argument_kinds = Counter({
        "constant": 27200,
        "frame-field": 731,
        "runtime": 53,
        "call-result": 11,
    })
    if scheduler_argument_kinds != expected_scheduler_argument_kinds:
        raise ValueError(
            "selector-zero scheduler argument inventory changed: "
            f"{scheduler_argument_kinds}"
        )
    expected_proven_browser_calls = Counter({
        "native-scheduler-countdown": 27942,
        "native-scheduler-global-readiness": 16,
        "native-signed-integer-division": 156,
        "native-signed-integer-remainder": 57,
    })
    expected_unresolved_browser_calls = Counter({
        "resumable-scheduler-dispatch": 966,
        "signed-integer-division": 304,
        "signed-integer-remainder": 56,
        "single-target-scheduler-dispatch": 200,
    })
    if (
        proven_browser_calls != expected_proven_browser_calls
        or unresolved_browser_calls != expected_unresolved_browser_calls
    ):
        raise ValueError(
            "browser runtime-interface coverage changed: "
            f"proven={proven_browser_calls}, "
            f"unresolved={unresolved_browser_calls}"
        )
    expected_secondary_ids = Counter({
        0: 96,
        1: 2301,
        2: 3,
        3: 96,
        4: 192,
        5: 286,
        6: 3,
    })
    if secondary_ids != expected_secondary_ids:
        raise ValueError(
            f"secondary-operation inventory changed: {secondary_ids}"
        )
    if secondary_argument_counts[(5, 8)] != 286:
        raise ValueError(
            "secondary operation 5 complete-argument inventory changed"
        )
    if secondary_subcommands[(1, 1)] != 118:
        raise ValueError("secondary operation 1 subcommand 1 count changed")
    if secondary_subcommands[(1, 12)] != 22:
        raise ValueError("secondary operation 1 subcommand 12 count changed")

    return {
        "schema": "new-yokosuka-scn3-runtime-interface-evidence-v1",
        "status": "exact-native-constructor-entry-thunk-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": (
                ".disc-work/dialogue/"
                "scripted-event-control-flow-index.json"
            ),
        },
        "nativeSlices": slices,
        "generatedEntryThunk": {
            "mapCount": sum(executable_thunk_hashes.values()),
            "allMapCount": sum(thunk_hashes.values()),
            "nonExecutableMapCount": len(nonexecutable_maps),
            "fileOffsetRelativeToScn3": "0x30",
            "length": ENTRY_THUNK_LENGTH,
            "sha256": ENTRY_THUNK_SHA256,
            "provenRegisterSetup": {
                "r8": "native runtime-interface object + 0x28",
                "r8+0x34": "scheduler/event context supplied by native runner",
                "r8+0x38": "active event-record invocation data",
                "r8+0x3c": "generated local continuation writer",
                "r9": "value loaded from r8+0x0c",
                "r10": "value loaded from r8+0x10",
            },
            "nonExecutableMaps": nonexecutable_maps,
        },
        "runtimeInterfaceSlots": [
            {
                "byteOffset": offset,
                "byteOffsetHex": f"0x{offset:02x}",
                **R8_SLOT_BEHAVIOR[offset],
                "callCount": slots[offset],
            }
            for offset in sorted(slots)
        ],
        "schedulerSelectorZero": {
            "handlerAddress": "0x0c16b47c",
            "argumentWordCount": 1,
            "behavior": [
                "read the payload dword",
                "decrement and store it with native wrapping",
                "return 0x00010000 when the original payload was zero",
                "return zero when the original payload was nonzero",
            ],
            "generatedResultTestMask": "0x00010000",
            "browserSemanticId": "native-scheduler-countdown",
            "allDiscArgumentKinds": dict(sorted(
                scheduler_argument_kinds.items()
            )),
            "frameFieldOffsets": {
                str(offset): count
                for offset, count in sorted(scheduler_frame_offsets.items())
            },
            "directArgumentCallCount": (
                scheduler_argument_kinds["constant"]
                + scheduler_argument_kinds["frame-field"]
            ),
            "deferredDependencyCallCount": (
                scheduler_argument_kinds["runtime"]
                + scheduler_argument_kinds["call-result"]
            ),
        },
        "schedulerSelectorNineteen": {
            "handlerAddress": "0x0c16398e",
            "readinessQueryAddress": "0x0c0e7c7c",
            "argumentWordCount": 0,
            "generatedResultTestMask": "0x00010000",
            "browserSemanticId": "native-scheduler-global-readiness",
            "allDiscCallCount": selector_nineteen[0],
            "areaCount": selector_nineteen[1],
            "dialogueRegionCallCount": selector_nineteen[2],
            "behavior": [
                "query the exact global readiness helper",
                "return zero while the helper is nonzero",
                "write -1 to the native operation result and return 0x00010000 once the helper is zero",
            ],
        },
        "allDiscInventory": {
            "callCount": sum(slots.values()),
            "dialogueRegionCallCount": dialogue_call_count,
            "continuationPairCounts": {
                "singleTargetSchedulerDispatchThenContinuation": (
                    pairs[(0x1C, 0x3C)]
                ),
                "resumableSchedulerDispatchThenContinuation": (
                    pairs[(0x2C, 0x3C)]
                ),
            },
            "secondaryOperationIds": {
                f"0x{operation_id:04x}": count
                for operation_id, count in sorted(secondary_ids.items())
            },
            "secondaryOperation5": {
                "callCount": secondary_ids[5],
                "eightArgumentCallCount": secondary_argument_counts[(5, 8)],
                "unresolvedArgumentCountCallCount": (
                    secondary_ids[5]
                    - secondary_argument_counts[(5, 8)]
                ),
                "recordSizeBytes": 52,
                "recordIndexArgument": 0,
                "copiedArgumentIndices": list(range(1, 8)),
                "destinationByteOffsets": list(range(24, 52, 4)),
            },
            "secondaryOperation1ProvenSubcommands": {
                "1": {
                    "callCount": secondary_subcommands[(1, 1)],
                    "argumentCount": 1,
                    "destinationByteOffset": 56,
                    "writtenValue": 1,
                },
                "12": {
                    "callCount": secondary_subcommands[(1, 12)],
                    "argumentCount": 1,
                    "destinationByteOffset": 56,
                    "writtenValue": 0,
                },
            },
        },
        "browserRuntimeCoverage": {
            "provenCallCount": sum(proven_browser_calls.values()),
            "unresolvedCallCount": sum(unresolved_browser_calls.values()),
            "provenSemanticIds": dict(sorted(proven_browser_calls.items())),
            "unresolvedCallKinds": dict(sorted(
                unresolved_browser_calls.items()
            )),
        },
        "provenBehavior": [
            (
                "The native runner passes runtime object +0x28 as generated "
                "r8; generated code does not receive the constructor object's "
                "base address directly."
            ),
            (
                "Every r8+0x3c call is the generated entry thunk's local "
                "continuation writer. It saves the native return address and "
                "r13/r14 into the active event record, then exits the thunk."
            ),
            (
                "All 119 MAPINFO programs with recovered executable native "
                "functions share the exact generated entry thunk. The 17 "
                "sentinel or alternate-format programs with no recovered "
                "function body are inventoried separately and receive no "
                "runtime-interface claim."
            ),
            (
                "Every r8+0x1c and r8+0x2c call is paired with that exact "
                "continuation transfer. Their selected handler behavior "
                "remains numeric and must be resolved separately."
            ),
            (
                "r8+0x14 is signed integer quotient and r8+0x18 is signed "
                "integer remainder; authored call sites use the pair for "
                "quotient/index and remainder/bit-position decomposition."
            ),
        ],
        "evidenceBoundary": [
            (
                "Runtime slot families and continuation mechanics are exact; "
                "handler-specific scheduler and secondary-operation meanings "
                "are not inferred from their ABI."
            ),
            (
                "No captured runtime address is required by this artifact; "
                "all assertions are checked against the executable, authored "
                "MAPINFO files, and statically extracted call inventory."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument(
        "--control-flow",
        type=Path,
        default=DEFAULT_CONTROL_FLOW,
    )
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.control_flow.read_text()),
        json.loads(args.event_ir.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['callCount']} calls"
    )


if __name__ == "__main__":
    main()
