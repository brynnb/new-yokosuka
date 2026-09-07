#!/usr/bin/env python3
"""Capture one model's native OSAG records before and after a handler call.

The probe observes ordinary handler calls from an unmodified Flycast guest.
It writes no guest memory and does not invoke game functions artificially.

The OSAG dispatcher calls a node handler with these SH-4 arguments:

* r4: the persistent OSAG simulation record;
* r5: the corresponding MT5 render node;
* r6: the handler's runtime-mode argument;
* r7: the render/matrix callback argument.

Earlier local captures called r5 an actor and treated every handler as the
type-0x78 chain solver.  That is not true for type 0x81: Shenhua's sleeve
records use the distinct bounded-angular handler at 0x0c135bec.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


NODE_SIZE = 0x140
RENDER_NODE_SIZE = 0x80
SECONDARY_GLOBALS_ADDRESS = 0x0C21D780
SECONDARY_GLOBALS_SIZE = 0x220


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def actor_tag_word(value: str) -> tuple[str, int]:
    normalized = value.strip().upper()
    if not normalized or len(normalized) > 4 or not normalized.isascii():
        raise argparse.ArgumentTypeError(
            "actor tag must contain one to four ASCII characters"
        )
    return (
        normalized,
        int.from_bytes(normalized.encode("ascii").ljust(4, b"\0"), "little"),
    )


def capture(host: str, port: int, timeout: float, sample_count: int,
            target_word: int, handler: int,
            caller_return: int) -> tuple[list[dict[str, object]], int]:
    handler_breakpoint = handler | 0x80000000
    caller_return_breakpoint = caller_return | 0x80000000
    remote = FlycastRemote(host, port, timeout)
    handler_installed = False
    return_installed = False
    stopped_at_handler = False
    stopped_at_return = False
    rejected = 0
    samples: list[dict[str, object]] = []
    try:
        remote.command("?")
        remote.add_breakpoint(handler_breakpoint)
        handler_installed = True
        while len(samples) < sample_count:
            remote.continue_until_stop()
            stopped = remote.read_register(16) | 0x80000000
            if stopped != handler_breakpoint:
                raise RemoteProtocolError(
                    f"stopped outside OSAG handler at {hx(stopped)}"
                )
            stopped_at_handler = True
            record = remote.read_register(4)
            render_node = remote.read_register(5)
            runtime_mode_argument = remote.read_register(6)
            matrix_callback_argument = remote.read_register(7)
            model_pointer = remote.read_u32(record + 4)
            model_word = remote.read_u32(model_pointer)
            if model_word != target_word:
                rejected += 1
                remote.step_over_breakpoint(handler_breakpoint)
                stopped_at_handler = False
                continue

            before = remote.read_memory(record, NODE_SIZE)
            render_node_raw = remote.read_memory(
                render_node, RENDER_NODE_SIZE
            )
            globals_before = remote.read_memory(
                SECONDARY_GLOBALS_ADDRESS, SECONDARY_GLOBALS_SIZE
            )
            remote.remove_breakpoint(handler_breakpoint)
            handler_installed = False
            remote.add_breakpoint(caller_return_breakpoint)
            return_installed = True
            remote.continue_until_stop()
            stopped = remote.read_register(16) | 0x80000000
            if stopped != caller_return_breakpoint:
                raise RemoteProtocolError(
                    f"stopped outside OSAG return at {hx(stopped)}"
                )
            stopped_at_return = True
            after = remote.read_memory(record, NODE_SIZE)
            samples.append({
                "sequence": len(samples),
                "capturedAtUnixSeconds": time.time(),
                "recordAddress": hx(record),
                "renderNodeAddress": hx(render_node),
                "runtimeModeArgument": runtime_mode_argument,
                "matrixCallbackArgument": hx(matrix_callback_argument),
                "modelPointer": hx(model_pointer),
                "modelWord": hx(model_word),
                "recordModeByte": before[0x0E],
                "secondaryGlobalsAddress": hx(SECONDARY_GLOBALS_ADDRESS),
                "secondaryGlobalsRawHex": globals_before.hex(),
                "beforeRawHex": before.hex(),
                "afterRawHex": after.hex(),
                "renderNodeRawHex": render_node_raw.hex(),
            })
            print(
                f"captured OSAG record {len(samples)}/{sample_count} "
                f"at {hx(record)} mode={before[0x0E] & 0x1f}",
                flush=True,
            )
            remote.step_over_breakpoint(caller_return_breakpoint)
            stopped_at_return = False
            remote.remove_breakpoint(caller_return_breakpoint)
            return_installed = False
            remote.add_breakpoint(handler_breakpoint)
            handler_installed = True
        return samples, rejected
    finally:
        if stopped_at_handler:
            try:
                remote.step_over_breakpoint(handler_breakpoint)
            except (OSError, RemoteProtocolError):
                pass
        if stopped_at_return:
            try:
                remote.step_over_breakpoint(caller_return_breakpoint)
            except (OSError, RemoteProtocolError):
                pass
        if handler_installed:
            try:
                remote.remove_breakpoint(handler_breakpoint)
            except (OSError, RemoteProtocolError):
                pass
        if return_installed:
            try:
                remote.remove_breakpoint(caller_return_breakpoint)
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
    parser.add_argument("--samples", type=int, default=28)
    parser.add_argument("--actor-tag", type=actor_tag_word, required=True)
    parser.add_argument("--handler", type=lambda value: int(value, 0), required=True)
    parser.add_argument(
        "--caller-return", type=lambda value: int(value, 0), required=True
    )
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--save-state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples must be positive")
    actor_tag, target_word = args.actor_tag
    started = time.time()
    samples, rejected = capture(
        args.host,
        args.port,
        args.timeout,
        args.samples,
        target_word,
        args.handler,
        args.caller_return,
    )
    payload = {
        "schema": "new-yokosuka-shenmue1-osag-runtime-capture-v1",
        "status": "captured",
        "source": {
            "executable": str(args.executable),
            "executableSha256": sha256(args.executable),
            "saveState": str(args.save_state),
            "saveStateSha256": sha256(args.save_state),
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "guestWrites": False,
            "artificialHandlerCalls": False,
        },
        "native": {
            "handler": hx(args.handler),
            "callerReturn": hx(args.caller_return),
            "nodeSize": NODE_SIZE,
            "renderNodeSize": RENDER_NODE_SIZE,
            "argumentContract": {
                "r4": "osag-record",
                "r5": "mt5-render-node",
                "r6": "runtime-mode",
                "r7": "matrix-callback",
            },
            "secondaryGlobalsAddress": hx(SECONDARY_GLOBALS_ADDRESS),
            "secondaryGlobalsSize": SECONDARY_GLOBALS_SIZE,
        },
        "targetActorTag": actor_tag,
        "elapsedSeconds": round(time.time() - started, 3),
        "rejectedNonTargetHits": rejected,
        "samples": samples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
