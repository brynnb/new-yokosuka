import hashlib
import struct
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dialogue_inventory import (  # noqa: E402
    DialogueFormatError,
    archive_record,
    decode_dialogue_text,
    normalize_dialogue_text,
    parse_afs,
    parse_srf,
    parse_srf_timing,
)


def block(payload: bytes) -> bytes:
    padding = (-len(payload)) % 4
    padded = payload + b"\0" * padding
    return struct.pack("<I", len(padded) + 4) + padded


def srf_record(speaker: str, text: str, timing: bytes) -> bytes:
    return (
        block(speaker.encode("ascii"))
        + block(text.encode("utf-8") + b"\0")
        + block(timing)
    )


def afs_archive(members: list[tuple[str, bytes]]) -> bytes:
    count = len(members)
    cursor = 0x800
    extents = []
    output = bytearray(cursor)
    for _name, payload in members:
        extents.append((cursor, len(payload)))
        required = cursor + len(payload)
        output.extend(b"\0" * (required - len(output)))
        output[cursor:required] = payload
        cursor = required
    directory_offset = (cursor + 0x7FF) & ~0x7FF
    output.extend(b"\0" * (directory_offset - len(output)))
    for name, _payload in members:
        encoded = name.encode("ascii")
        output.extend(encoded + b"\0" * (32 - len(encoded)) + b"\0" * 16)
    struct.pack_into("<4sI", output, 0, b"AFS\0", count)
    for index, extent in enumerate(extents):
        struct.pack_into("<II", output, 8 + index * 8, *extent)
    return bytes(output)


class SrfParserTests(unittest.TestCase):
    def test_decodes_native_euc_jp_and_preserves_controls(self):
        text, encoding = decode_dialogue_text(
            "そうですか？＆Ryo=@".encode("euc_jp")
        )

        self.assertEqual(encoding, "euc_jp")
        self.assertEqual(text, "そうですか？＆Ryo=@")
        self.assertEqual(
            normalize_dialogue_text(text),
            "そうですか？\nRyo...",
        )

    def test_parses_native_three_block_records(self):
        timing = b"\x04\x00\x02\x00\x06\x00\x00\x00\xff\xff\xff\xff"
        data = (
            srf_record("AKIR", "Nozomi!", timing)
            + srf_record("HRSK", "Ryo=@", b"\xff\xff\xff\xff")
        )

        records = parse_srf(data)

        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].speaker_id, "AKIR")
        self.assertEqual(records[0].source_text, "Nozomi!")
        self.assertEqual(records[1].speaker_id, "HRSK")
        self.assertEqual(records[1].source_text, "Ryo=@")
        self.assertEqual(records[1].display_text, "Ryo...")
        self.assertEqual(records[1].text_encoding, "ascii")
        self.assertEqual(
            records[0].timing_sha256,
            hashlib.sha256(timing).hexdigest(),
        )
        self.assertEqual(records[0].timing_cues, ((4, 6),))
        self.assertEqual(records[1].timing_cues, ())

    def test_validates_native_mouth_cue_fields(self):
        self.assertEqual(
            parse_srf_timing(
                struct.pack("<hhhh", 5, 2, 18, 0)
                + struct.pack("<hhhh", 0, 2, 4, 0)
                + b"\xff\xff\xff\xff"
            ),
            ((5, 18), (0, 4)),
        )
        with self.assertRaises(DialogueFormatError):
            parse_srf_timing(
                struct.pack("<hhhh", 5, 1, 18, 0)
                + b"\xff\xff\xff\xff"
            )

    def test_rejects_a_truncated_block(self):
        with self.assertRaises(DialogueFormatError):
            parse_srf(struct.pack("<I", 12) + b"AKIR")

    def test_skips_native_sector_padding_between_record_groups(self):
        first = srf_record("AKIR", "First", b"\xff\xff\xff\xff")
        second = srf_record("HRSK", "Second", b"\xff\xff\xff\xff")
        padded = first + b"\0" * (0x800 - len(first)) + second

        records = parse_srf(padded)

        self.assertEqual([record.source_text for record in records], [
            "First",
            "Second",
        ])
        self.assertEqual(records[1].offset, 0x800)

    def test_preserves_an_empty_native_speaker_id(self):
        records = parse_srf(
            srf_record("", "A letter", b"\xff\xff\xff\xff")
        )

        self.assertEqual(records[0].speaker_id, "")


class AfsParserTests(unittest.TestCase):
    def test_uses_native_directory_names_and_exact_voice_alignment(self):
        subtitle = (
            srf_record("AKIR", "First", b"\xff\xff\xff\xff")
            + srf_record("HRSK", "Second", b"\xff\xff\xff\xff")
        )
        data = afs_archive(
            [
                ("TESTA001.str", b"SPSD-one"),
                ("TESTA002.str", b"SPSD-two"),
                ("TEST.SRF", subtitle),
            ]
        )

        members = parse_afs(data)
        self.assertEqual([member.name for member in members], [
            "TESTA001.str",
            "TESTA002.str",
            "TEST.SRF",
        ])

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "TEST.AFS"
            path.write_bytes(data)
            record = archive_record(
                path,
                disc=1,
                scene="TEST",
                include_text=True,
            )

        subtitle_set = record["subtitles"][0]
        self.assertTrue(subtitle_set["exactVoiceAlignment"])
        self.assertEqual(
            [
                line["voiceMember"]
                for line in subtitle_set["records"]
            ],
            ["TESTA001.str", "TESTA002.str"],
        )
        self.assertEqual(
            subtitle_set["records"][1]["sourceText"],
            "Second",
        )
        self.assertEqual(
            subtitle_set["records"][0]["lipSync"]["tickRate"],
            60,
        )

    def test_does_not_guess_voice_alignment_when_counts_differ(self):
        subtitle = srf_record("AKIR", "Only", b"\xff\xff\xff\xff")
        data = afs_archive(
            [
                ("TESTA001.str", b"SPSD-one"),
                ("TESTA002.str", b"SPSD-two"),
                ("TEST.SRF", subtitle),
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "TEST.AFS"
            path.write_bytes(data)
            record = archive_record(
                path,
                disc=1,
                scene="TEST",
                include_text=False,
            )

        subtitle_set = record["subtitles"][0]
        self.assertFalse(subtitle_set["exactVoiceAlignment"])
        self.assertIsNone(subtitle_set["records"][0]["voiceMember"])
        self.assertNotIn("sourceText", subtitle_set["records"][0])

    def test_aligns_each_native_voice_group_with_its_following_srf(self):
        first = srf_record("AKIR", "First", b"\xff\xff\xff\xff")
        second = srf_record("HRSK", "Second", b"\xff\xff\xff\xff")
        data = afs_archive(
            [
                ("FIRSTA001.str", b"SPSD-one"),
                ("FIRST.SRF", first),
                ("SECONDA001.str", b"SPSD-two"),
                ("SECOND.SRF", second),
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "GROUPED.AFS"
            path.write_bytes(data)
            record = archive_record(
                path,
                disc=1,
                scene="TEST",
                include_text=True,
            )

        self.assertEqual(
            [
                subtitle["records"][0]["voiceMember"]
                for subtitle in record["subtitles"]
            ],
            ["FIRSTA001.str", "SECONDA001.str"],
        )


if __name__ == "__main__":
    unittest.main()
