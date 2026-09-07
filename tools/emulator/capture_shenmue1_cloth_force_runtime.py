#!/usr/bin/env python3
"""Capture the exact CLTH force vectors selected by FUN_0c0af35e.

The probe stops after both native controller-derived force vectors have been
resolved and before the first lattice row is integrated. It is observational:
no guest state is written and no game function is invoked artificially.
"""

from __future__ import annotations

import argparse
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


# The first instruction of the row loop. The two force vectors remain live at
# stack +0x24 and +0x48 here; unlike the nearby branch-join address this is an
# instruction that every nonempty lattice necessarily executes.
FORCE_READY = 0x0C0AF81E
FORCE_READY_BREAKPOINT = FORCE_READY | 0x80000000
GROUP_SIZE = 0x88
OWNER_SIZE = 0x44


def hx(value: int) -> str:
    return f"0x{value:08x}"


def u32(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<I", raw, offset)[0]


def model_word(text: str) -> int | None:
    if text.upper() in {"ANY", "*"}:
        return None
    encoded = text.upper().encode("ascii")
    if not 1 <= len(encoded) <= 4:
        raise argparse.ArgumentTypeError("model code must contain 1-4 ASCII characters")
    return int.from_bytes(encoded.ljust(4, b" "), "little")


def decode_model_word(value: int) -> str:
    return value.to_bytes(4, "little").rstrip(b"\0 ").decode("ascii", "replace")


def vector(raw: bytes, offset: int) -> list[float]:
    return list(struct.unpack_from("<3f", raw, offset))


def capture_samples(
    host: str,
    port: int,
    timeout: float,
    sample_count: int,
    target_model: int | None,
) -> tuple[list[dict[str, object]], int]:
    remote = FlycastRemote(host, port, timeout)
    installed = False
    stopped = False
    rejected = 0
    samples: list[dict[str, object]] = []
    try:
        remote.command("?")
        remote.add_breakpoint(FORCE_READY_BREAKPOINT)
        installed = True
        while len(samples) < sample_count:
            remote.continue_until_register(16, FORCE_READY, timeout=timeout)
            stopped = True
            stack = remote.read_register(15)
            stack_raw = remote.read_memory(stack, 0x6C)
            group = u32(stack_raw, 0)
            group_raw = remote.read_memory(group, GROUP_SIZE)
            owner = u32(group_raw, 0x80)
            owner_raw = remote.read_memory(owner, OWNER_SIZE)
            observed_model = u32(owner_raw, 0x2C)
            if target_model is None or observed_model == target_model:
                samples.append({
                    "sequence": len(samples),
                    "capturedAtUnixSeconds": time.time(),
                    "forceReadyAddress": hx(FORCE_READY),
                    "stackAddress": hx(stack),
                    "groupAddress": hx(group),
                    "ownerAddress": hx(owner),
                    "ownerModelWord": hx(observed_model),
                    "ownerModelCode": decode_model_word(observed_model),
                    "ownerRuntimeMode": owner_raw[6],
                    "ownerProfileIndex": struct.unpack_from("<H", owner_raw, 0x40)[0],
                    "controlType": struct.unpack_from("<h", group_raw, 4)[0],
                    "primaryControllerA": vector(stack_raw, 0x3C),
                    "primaryControllerB": vector(stack_raw, 0x30),
                    "primaryTarget": vector(stack_raw, 0x54),
                    "primaryForce": vector(stack_raw, 0x48),
                    "secondaryForce": vector(stack_raw, 0x24),
                    "stackRawHex": stack_raw.hex(),
                })
                print(
                    f"captured {decode_model_word(observed_model)} CLTH force "
                    f"{len(samples)}/{sample_count}: "
                    f"primary={samples[-1]['primaryForce']} "
                    f"secondary={samples[-1]['secondaryForce']}",
                    flush=True,
                )
            else:
                rejected += 1
            remote.step_over_breakpoint(FORCE_READY_BREAKPOINT)
            stopped = False
        return samples, rejected
    finally:
        if stopped:
            try:
                remote.step_over_breakpoint(FORCE_READY_BREAKPOINT)
            except (OSError, RemoteProtocolError):
                pass
        if installed:
            try:
                remote.remove_breakpoint(FORCE_READY_BREAKPOINT)
            except (OSError, RemoteProtocolError):
                pass
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass
        remote.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--model", type=model_word, default=model_word("MGR"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    samples, rejected = capture_samples(
        args.host,
        args.port,
        args.timeout,
        args.samples,
        args.model,
    )
    payload = {
        "schemaVersion": 1,
        "probe": "FUN_0c0af35e-force-ready",
        "targetModelWord": None if args.model is None else hx(args.model),
        "rejectedBreakpointHits": rejected,
        "samples": samples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
