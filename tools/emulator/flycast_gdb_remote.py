"""Small Flycast GDB-remote client for live Dreamcast validation tools."""

from __future__ import annotations

import socket
import struct
import time


class RemoteProtocolError(RuntimeError):
    pass


class FlycastRemote:
    def __init__(self, host: str, port: int, timeout: float) -> None:
        self.socket = socket.create_connection((host, port), timeout=timeout)
        self.socket.settimeout(timeout)
        self.buffer = bytearray()

    def close(self) -> None:
        self.socket.close()

    @staticmethod
    def _packet(payload: str) -> bytes:
        encoded = payload.encode("ascii")
        checksum = sum(encoded) & 0xFF
        return b"$" + encoded + f"#{checksum:02x}".encode("ascii")

    def _receive_packet(self) -> str:
        while True:
            marker = self.buffer.find(b"$")
            if marker >= 0:
                if marker:
                    del self.buffer[:marker]
                checksum_marker = self.buffer.find(b"#", 1)
                if checksum_marker >= 0 and len(self.buffer) >= checksum_marker + 3:
                    encoded = bytes(self.buffer[1:checksum_marker])
                    checksum = int(
                        self.buffer[checksum_marker + 1 : checksum_marker + 3],
                        16,
                    )
                    del self.buffer[: checksum_marker + 3]
                    if sum(encoded) & 0xFF != checksum:
                        self.socket.sendall(b"-")
                        raise RemoteProtocolError("Flycast sent a bad RSP checksum")
                    self.socket.sendall(b"+")
                    return encoded.decode("ascii")
            chunk = self.socket.recv(4096)
            if not chunk:
                raise RemoteProtocolError("Flycast closed the debugger connection")
            self.buffer.extend(chunk)

    def _receive_ack_or_stop(self) -> bool:
        while True:
            for index, value in enumerate(self.buffer):
                if value in (ord("+"), ord("-")):
                    del self.buffer[: index + 1]
                    if value == ord("-"):
                        raise RemoteProtocolError(
                            "Flycast rejected the previous RSP packet"
                        )
                    return False
                if value == ord("$"):
                    # A fast breakpoint can stop the guest before Flycast's
                    # asynchronous continue ACK is written. In that ordering
                    # the stop packet is the acknowledgement; leave it queued
                    # for wait_for_stop().
                    return True
            chunk = self.socket.recv(4096)
            if not chunk:
                raise RemoteProtocolError(
                    "Flycast closed the debugger connection"
                )
            self.buffer.extend(chunk)

    def command(self, payload: str, *, expect_reply: bool = True) -> str | None:
        self.socket.sendall(self._packet(payload))
        if not expect_reply:
            return None
        reply = self._receive_packet()
        if reply.startswith("E"):
            raise RemoteProtocolError(f"Flycast rejected {payload!r}: {reply}")
        return reply

    def _command_non_stop_reply(self, payload: str) -> str:
        reply = self.command(payload)
        assert reply is not None
        # Flycast can queue the same asynchronous trap report more than once.
        # A register, memory, or matchpoint command cannot legitimately return
        # a stop packet, so consume queued reports until this command's reply.
        while reply.startswith(("S", "T")):
            reply = self._receive_packet()
        if reply.startswith("E"):
            raise RemoteProtocolError(
                f"Flycast rejected {payload!r}: {reply}"
            )
        return reply

    def wait_for_stop(self) -> str:
        reply = self._receive_packet()
        if not reply.startswith(("S", "T")):
            raise RemoteProtocolError(f"Expected target stop, received {reply!r}")
        return reply

    def read_register(self, register_number: int) -> int:
        reply = self._command_non_stop_reply(f"p{register_number:x}")
        try:
            raw = bytes.fromhex(reply)
        except ValueError as error:
            raise RemoteProtocolError(
                f"Register {register_number} returned non-hex reply {reply!r}"
            ) from error
        if len(raw) != 4:
            raise RemoteProtocolError(
                f"Register {register_number} returned {len(raw)} bytes"
            )
        return struct.unpack("<I", raw)[0]

    def write_register(self, register_number: int, value: int) -> None:
        raw = struct.pack("<I", value & 0xFFFFFFFF).hex()
        if self._command_non_stop_reply(f"P{register_number:x}={raw}") != "OK":
            raise RemoteProtocolError(
                f"Could not write register {register_number}"
            )

    def read_memory(self, address: int, length: int) -> bytes:
        reply = self._command_non_stop_reply(f"m{address:x},{length:x}:")
        raw = bytes.fromhex(reply)
        if len(raw) != length:
            raise RemoteProtocolError(
                f"Memory at 0x{address:08x} returned {len(raw)} bytes"
            )
        return raw

    def read_u32(self, address: int) -> int:
        return struct.unpack("<I", self.read_memory(address, 4))[0]

    def write_memory(self, address: int, value: bytes) -> None:
        raw = bytes(value)
        if self._command_non_stop_reply(
            f"M{address:x},{len(raw):x}:{raw.hex()}"
        ) != "OK":
            raise RemoteProtocolError(
                f"Could not write memory at 0x{address:08x}"
            )

    def add_breakpoint(self, address: int) -> None:
        if self._command_non_stop_reply(f"Z0,{address:x},2") != "OK":
            raise RemoteProtocolError(
                f"Could not add breakpoint at 0x{address:08x}"
            )

    def remove_breakpoint(self, address: int) -> None:
        if self._command_non_stop_reply(f"z0,{address:x},2") != "OK":
            raise RemoteProtocolError(
                f"Could not remove breakpoint at 0x{address:08x}"
            )

    def single_step(self) -> str:
        reply = self.command("s")
        if reply is None or not reply.startswith(("S", "T")):
            raise RemoteProtocolError(f"Single-step returned {reply!r}")
        return reply

    def step_over_current_breakpoint(self) -> None:
        self.single_step()

    def step_over_breakpoint(self, breakpoint_address: int) -> None:
        # Flycast reports the stopped SH-4 PC through its canonical P0 address
        # even when the software trap was installed through the cached P1
        # mirror. Remove and restore the exact installed address explicitly;
        # the server's current-PC helper cannot match across those aliases.
        self.remove_breakpoint(breakpoint_address)
        self.single_step()
        self.add_breakpoint(breakpoint_address)

    def continue_until_stop(self) -> str:
        self.command("c", expect_reply=False)
        # Flycast sends the continue acknowledgement asynchronously. Waiting
        # for it prevents a fast guest trap from racing the server's pending
        # ACK write, which otherwise makes Flycast drop the stop packet.
        self._receive_ack_or_stop()
        return self.wait_for_stop()

    def continue_until_register(
        self,
        register_number: int,
        expected_value: int,
        *,
        timeout: float,
        poll_interval: float = 0.002,
        start_address: int | None = None,
    ) -> int:
        """Continue and tolerate Flycast dropping a fast trap notification.

        Flycast can stop the SH-4 on a software breakpoint while its GDB
        thread is still writing the continue acknowledgement. In that case it
        logs and drops the asynchronous S05 packet even though the guest is
        correctly paused. Polling a register after the acknowledgement
        observes that stopped state without re-running or single-stepping the
        native call.
        """
        command = "c" if start_address is None else f"c{start_address & 0xFFFFFFFF:x}"
        self.command(command, expect_reply=False)
        stopped = self._receive_ack_or_stop()
        if stopped:
            self.wait_for_stop()
        else:
            # Do not query PC in the small window between the guest reaching
            # the return address and Flycast converting its software trap to
            # a stopped-target report. A register reply in that window makes
            # the server drop S05 and lets TRAPA fall through to the guest.
            time.sleep(0.02)
        deadline = time.monotonic() + timeout
        expected = expected_value & 0xFFFFFFFF
        while True:
            value = self.read_register(register_number)
            if value == expected:
                return value
            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"register {register_number} did not reach "
                    f"0x{expected:08x} (last 0x{value:08x})"
                )
            time.sleep(poll_interval)

    def continue_until_register_values(
        self,
        register_number: int,
        expected_values: set[int],
        *,
        timeout: float,
        poll_interval: float = 0.002,
    ) -> int:
        """Continue until one of several installed breakpoint PCs is reached."""
        expected = {value & 0xFFFFFFFF for value in expected_values}
        if not expected:
            raise ValueError("at least one expected register value is required")
        self.command("c", expect_reply=False)
        stopped = self._receive_ack_or_stop()
        if stopped:
            self.wait_for_stop()
        else:
            time.sleep(0.02)
        deadline = time.monotonic() + timeout
        while True:
            value = self.read_register(register_number)
            if value in expected:
                return value
            if time.monotonic() >= deadline:
                formatted = ", ".join(f"0x{value:08x}" for value in sorted(expected))
                raise TimeoutError(
                    f"register {register_number} did not reach any of "
                    f"{formatted} (last 0x{value:08x})"
                )
            time.sleep(poll_interval)

    def resume(self) -> None:
        self.command("c", expect_reply=False)
        stopped = self._receive_ack_or_stop()
        if stopped:
            raise RemoteProtocolError(
                "Target stopped before Flycast acknowledged continue"
            )
    def detach(self) -> None:
        if self._command_non_stop_reply("D") != "OK":
            raise RemoteProtocolError("Flycast rejected debugger detach")
