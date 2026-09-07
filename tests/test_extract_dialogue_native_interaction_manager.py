import importlib.util
import pathlib
import struct
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "native_interaction_manager",
    ROOT / "tools/scripting/extract_dialogue_native_interaction_manager.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeInteractionManagerExtractorTests(unittest.TestCase):
    def test_descriptor_table_stops_on_first_aligned_sentinel(self):
        first = list(range(MODULE.DESCRIPTOR_WORDS))
        second = list(range(100, 100 + MODULE.DESCRIPTOR_WORDS))
        data = (
            struct.pack(f"<{MODULE.DESCRIPTOR_WORDS}I", *first)
            + struct.pack(f"<{MODULE.DESCRIPTOR_WORDS}I", *second)
            + struct.pack("<I", 0xFFFFFFFF)
            + b"following-table"
        )
        records, sentinel = MODULE.descriptor_records(data, 0, len(data))
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["words"], first)
        self.assertEqual(records[1]["words"], second)
        self.assertEqual(sentinel, MODULE.DESCRIPTOR_SIZE * 2)

    def test_descriptor_sentinel_needs_only_one_dword(self):
        data = (
            struct.pack(f"<{MODULE.DESCRIPTOR_WORDS}I", *range(13))
            + struct.pack("<I", 0xFFFFFFFF)
        )
        records, sentinel = MODULE.descriptor_records(data, 0, len(data))
        self.assertEqual(len(records), 1)
        self.assertEqual(sentinel, MODULE.DESCRIPTOR_SIZE)

    def test_indirect_graph_decodes_sentinel_sequences_and_36_byte_records(self):
        descriptors = [
            {"index": 0, "words": [0] + [0] * 12},
            {"index": 1, "words": [3] + [0] * 12},
        ]
        index_table = struct.pack("<5I", 4, 7, 0xFFFFFFFF, 9, 0xFFFFFFFF)
        record_table = bytearray(10 * MODULE.INDIRECT_RECORD_SIZE)
        for index, record_type in ((4, 1), (7, 2), (9, 2)):
            words = [record_type, index] + [0] * 7
            struct.pack_into(
                f"<{MODULE.INDIRECT_RECORD_WORDS}I",
                record_table,
                index * MODULE.INDIRECT_RECORD_SIZE,
                *words,
            )
        data = index_table + record_table
        sequences, records = MODULE.indirect_record_graph(
            data,
            descriptors,
            0,
            len(index_table),
            len(index_table),
        )
        self.assertEqual(sequences, [[4, 7], [9]])
        self.assertEqual(
            [(record["index"], record["type"]) for record in records],
            [(4, 1), (7, 2), (9, 2)],
        )


if __name__ == "__main__":
    unittest.main()
