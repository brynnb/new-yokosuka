#!/usr/bin/env python3
"""Trace exact SCN3 operation dispatches from a live Flycast process."""

from __future__ import annotations

import argparse
import json
import struct
import time
from collections import Counter
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


DISPATCHER_ADDRESS = 0x0C0BB69C
DISPATCHER_BREAKPOINT_ADDRESS = DISPATCHER_ADDRESS | 0x80000000
HANDLER_TABLE_ADDRESS = 0x0C29A9E0


def trace(
    remote: FlycastRemote,
    count: int,
    target_operation_ids: tuple[int, ...],
) -> tuple[list[dict[str, object]], bool]:
    observations: list[dict[str, object]] = []
    timed_out = False
    installed: list[int] = []
    try:
        remote.command("?")
        handler_operations: dict[int, int] = {}
        if target_operation_ids:
            for operation_id in target_operation_ids:
                handler = remote.read_u32(
                    HANDLER_TABLE_ADDRESS + operation_id * 4
                )
                breakpoint_address = handler | 0x80000000
                existing = handler_operations.get(breakpoint_address)
                if existing is not None and existing != operation_id:
                    raise RemoteProtocolError(
                        "Target operations share handler "
                        f"0x{handler:08x}: 0x{existing:04x}, "
                        f"0x{operation_id:04x}"
                    )
                handler_operations[breakpoint_address] = operation_id
                remote.add_breakpoint(breakpoint_address)
                installed.append(breakpoint_address)
        else:
            remote.add_breakpoint(DISPATCHER_BREAKPOINT_ADDRESS)
            installed.append(DISPATCHER_BREAKPOINT_ADDRESS)
        while len(observations) < count:
            try:
                remote.continue_until_stop()
            except TimeoutError:
                timed_out = True
                break
            if target_operation_ids:
                reported_pc = remote.read_register(16)
                breakpoint_address = reported_pc | 0x80000000
                operation_id = handler_operations.get(breakpoint_address)
                if operation_id is None:
                    raise RemoteProtocolError(
                        "Stopped at unexpected target handler "
                        f"0x{reported_pc:08x}"
                    )
                argument_array = remote.read_register(5)
                handler = reported_pc
            else:
                breakpoint_address = DISPATCHER_BREAKPOINT_ADDRESS
                operation_id = remote.read_register(5)
                argument_array = remote.read_register(6)
                handler = remote.read_u32(
                    HANDLER_TABLE_ADDRESS + operation_id * 4
                )
            raw_arguments = remote.read_memory(argument_array, 16)
            arguments = list(struct.unpack("<4I", raw_arguments))
            observation = {
                "sequence": len(observations),
                "operationId": operation_id,
                "operationHex": f"0x{operation_id:04x}",
                "handlerAddress": f"0x{handler:08x}",
                "breakpointAddress": f"0x{breakpoint_address:08x}",
                "argumentArrayAddress": f"0x{argument_array:08x}",
                "argumentWords": [f"0x{value:08x}" for value in arguments],
            }
            observations.append(observation)
            print(
                f"{observation['sequence']:03d} "
                f"{observation['operationHex']} -> "
                f"{observation['handlerAddress']}",
                flush=True,
            )
            if len(observations) < count:
                remote.step_over_breakpoint(breakpoint_address)
        return observations, timed_out
    finally:
        for address in reversed(installed):
            try:
                remote.remove_breakpoint(address)
            except (OSError, RemoteProtocolError):
                pass
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3263)
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--count", type=int, default=32)
    parser.add_argument(
        "--operation",
        action="append",
        default=[],
        help=(
            "trace only this operation ID at its live handler; accepts "
            "decimal or 0x-prefixed values and may be repeated"
        ),
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")
    try:
        target_operation_ids = tuple(
            dict.fromkeys(int(value, 0) for value in args.operation)
        )
    except ValueError as error:
        parser.error(f"invalid --operation: {error}")
    if any(
        operation_id < 0 or operation_id > 0x1FF
        for operation_id in target_operation_ids
    ):
        parser.error("--operation must be between 0 and 0x1ff")

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        observations, timed_out = trace(
            remote, args.count, target_operation_ids
        )
    finally:
        remote.close()

    counts = Counter(
        observation["operationHex"] for observation in observations
    )
    payload = {
        "schema": "new-yokosuka-live-operation-dispatch-trace-v1",
        "status": (
            "complete"
            if len(observations) == args.count
            else "partial"
            if observations
            else "not-observed"
        ),
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": "live SH-4 registers and handler-table RAM",
        },
        "dispatcherAddress": f"0x{DISPATCHER_ADDRESS:08x}",
        "dispatcherBreakpointAddress": (
            f"0x{DISPATCHER_BREAKPOINT_ADDRESS:08x}"
        ),
        "handlerTableAddress": f"0x{HANDLER_TABLE_ADDRESS:08x}",
        "traceMode": (
            "target-handlers"
            if target_operation_ids
            else "shared-dispatcher"
        ),
        "targetOperationIds": [
            f"0x{operation_id:04x}"
            for operation_id in target_operation_ids
        ],
        "elapsedSeconds": round(time.time() - started_at, 3),
        "requestedObservationCount": args.count,
        "observationCount": len(observations),
        "timedOut": timed_out,
        "operationCounts": dict(sorted(counts.items())),
        "observations": observations,
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
