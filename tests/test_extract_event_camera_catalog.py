#!/usr/bin/env python3

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_event_camera_catalog import build_report, parse_ecam  # noqa: E402


def curve(times, values, slopes):
    count = len(times)
    assert len(values) == count
    assert len(slopes) == count
    return (
        struct.pack("<I", count)
        + struct.pack(f"<{count}f", *times)
        + struct.pack(f"<{count}f", *values)
        + struct.pack(f"<{count}f", *slopes)
    )


class EventCameraCatalogTest(unittest.TestCase):
    def test_parses_exact_parallel_curve_layout(self):
        channels = [
            curve([0, 5], [index, index + 1], [0, 0])
            for index in range(8)
        ]
        body = b"".join(channels)
        record = b"2950" + struct.pack("<II", 12 + len(body), 0x60) + body
        chunk = b"ECAM" + struct.pack("<I", 8 + len(record)) + record
        parsed = parse_ecam(b"prefix!!" + chunk + b"suffix")
        self.assertEqual(parsed["ecamFileOffset"], "0x8")
        self.assertEqual(len(parsed["records"]), 1)
        camera = parsed["records"][0]
        self.assertEqual(camera["cameraNumber"], 2950)
        self.assertEqual(camera["flags"], 0x60)
        self.assertEqual(
            camera["curves"]["positionX"]["times"],
            [0.0, 5.0],
        )
        self.assertEqual(
            camera["curves"]["perspective"]["values"],
            [7.0, 8.0],
        )

    def test_rejects_trailing_record_bytes(self):
        body = b"".join(curve([], [], []) for _ in range(8)) + b"\0\0\0\0"
        record = b"0001" + struct.pack("<II", 12 + len(body), 0) + body
        chunk = b"ECAM" + struct.pack("<I", 8 + len(record)) + record
        with self.assertRaisesRegex(ValueError, "unparsed bytes"):
            parse_ecam(chunk)

    def test_optional_roll_and_perspective_follow_flag_bits(self):
        body = b"".join(curve([], [], []) for _ in range(6))
        record = b"4018" + struct.pack("<II", 12 + len(body), 0) + body
        chunk = b"ECAM" + struct.pack("<I", 8 + len(record)) + record
        camera = parse_ecam(chunk)["records"][0]
        self.assertEqual(camera["curves"]["roll"]["count"], 0)
        self.assertEqual(camera["curves"]["perspective"]["count"], 0)

    def test_build_report_can_retain_an_explicit_bounded_camera_set(self):
        body = b"".join(curve([], [], []) for _ in range(6))
        records = b"".join(
            str(number).encode("ascii")
            + struct.pack("<II", 12 + len(body), 0)
            + body
            for number in (3031, 3032)
        )
        chunk = b"ECAM" + struct.pack("<I", 8 + len(records)) + records
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as directory:
            path = Path(directory) / "MAPINFO.BIN"
            path.write_bytes(chunk)
            report = build_report(path, {3032})
            self.assertEqual(
                [record["cameraNumber"] for record in report["records"]],
                [3032],
            )
            with self.assertRaisesRegex(ValueError, "missing"):
                build_report(path, {9999})


if __name__ == "__main__":
    unittest.main()
