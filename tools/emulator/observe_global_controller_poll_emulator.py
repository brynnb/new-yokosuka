#!/usr/bin/env python3
"""Observe natural operation-0x0116 poll results in a live Flycast guest."""

from __future__ import annotations

import argparse
import json
import time

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


RETURN_ADDRESS = 0x0C174190
BREAKPOINT_ADDRESS = RETURN_ADDRESS | 0x80000000


def signed32(value: int) -> int:
    return value if value < 0x80000000 else value - 0x100000000


def fourcc(value: int) -> str | None:
    raw = value.to_bytes(4, "little")
    return raw.decode("ascii") if all(0x20 <= byte < 0x7F for byte in raw) else None


def observe(remote: FlycastRemote, count: int) -> list[dict[str, object]]:
    observations: list[dict[str, object]] = []
    remote.command("?")
    remote.add_breakpoint(BREAKPOINT_ADDRESS)
    try:
        while len(observations) < count:
            remote.continue_until_stop()
            selector = signed32(remote.read_register(14))
            result = remote.read_register(13)
            if selector == -1:
                item = {
                    "sequence": len(observations),
                    "result": signed32(result),
                    "resultHex": f"0x{result:08x}",
                    "fourcc": fourcc(result),
                }
                observations.append(item)
                if result != 0xFFFFFFFF:
                    print(json.dumps(item), flush=True)
            if len(observations) < count:
                remote.step_over_breakpoint(BREAKPOINT_ADDRESS)
    finally:
        try:
            remote.remove_breakpoint(BREAKPOINT_ADDRESS)
        except (OSError, RemoteProtocolError):
            pass
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass
    return observations


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--count", type=int, default=600)
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        observations = observe(remote, args.count)
    finally:
        remote.close()
    non_idle = [item for item in observations if item["result"] != -1]
    payload = {
        "schema": "new-yokosuka-live-global-controller-poll-v1",
        "status": "observed" if non_idle else "idle-only",
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "guestWrites": False,
            "artificialHandlerCalls": False,
        },
        "returnAddress": f"0x{RETURN_ADDRESS:08x}",
        "elapsedSeconds": round(time.time() - started_at, 3),
        "pollCount": len(observations),
        "nonIdleObservations": non_idle,
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output:
        from pathlib import Path

        Path(args.output).write_text(rendered)
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
