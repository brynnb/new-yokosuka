import json
import gzip
import struct
import tempfile
import unittest
from pathlib import Path

from tools.assets.extract_shenmue2_models import (
    ipac_members,
    stage_models,
    texture_records,
)
from tools.assets.merge_shenmue2_models import merge_models


class Shenmue2ModelExtractionTest(unittest.TestCase):
    def test_merges_distinct_discs_and_rejects_corrupt_assets_without_replacing_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = []
            for disc in (2, 3, 4):
                area = root / f"disc{disc}" / "data" / "SCENE" / f"0{disc}" / "TEST"
                area.mkdir(parents=True)
                (area / "MPK00.PKS").write_bytes(
                    self.ipac(b"MAP", b"MAPM", b"MDO7" + bytes(12)))
                output = root / f"staged{disc}"
                stage_models(root / f"disc{disc}", output, f"S2DC_D{disc}")
                inputs.append(output)
            merged = root / "merged"
            summary = merge_models(inputs, merged)
            self.assertEqual(summary["modelCount"], 3)
            catalog = (merged / "viewer-models.json").read_text()
            self.assertEqual({m["disc"] for m in json.loads(catalog)["models"]}, {2, 3, 4})
            next((inputs[0] / "models").iterdir()).write_bytes(b"damaged")
            with self.assertRaisesRegex(ValueError, "does not match its manifest"):
                merge_models(inputs, merged)
            self.assertEqual((merged / "viewer-models.json").read_text(), catalog)

    def test_multiple_scenarios_and_repeated_members_preserve_every_model(self):
        payloads = [b"MDO7" + bytes([value]) * 12 for value in (1, 2)]
        dictionary = b"".join(struct.pack("<8s4sII", b"MAP", b"MAPM", 56 + i * 16, 16)
                              for i in range(2))
        archive = b"IPAC" + struct.pack("<III", 16, 2, 32) + dictionary + b"".join(payloads)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for scene in ("03", "04"):
                area = root / "disc" / "data" / "SCENE" / scene / "TEST"
                area.mkdir(parents=True)
                (area / "MPK00.PKS").write_bytes(archive)
            output = root / "staged"
            report = stage_models(root / "disc", output, "S2DC_D3")
            self.assertEqual(len(report["models"]), 4)
            self.assertEqual(len({m["filename"] for m in report["models"]}), 4)
            self.assertEqual({m["scene"] for m in report["models"]}, {"03", "04"})
            self.assertEqual({m["sourceMemberIndex"] for m in report["models"]}, {0, 1})
            self.assertTrue(all(m["duplicateMemberName"] for m in report["models"]))
            self.assertEqual({(output / "models" / m["filename"]).read_bytes()
                              for m in report["models"]}, set(payloads))
            merged = root / "merged"
            merge_models([output], merged)
            viewer = json.loads((merged / "viewer-models.json").read_text())
            self.assertEqual(len(viewer["models"]), 4)
            self.assertNotIn(str(root), json.dumps(viewer))
            # Duplicate inputs must fail without replacing the last good catalog.
            with self.assertRaises(ValueError):
                merge_models([output, output], merged)
            self.assertEqual(viewer, json.loads((merged / "viewer-models.json").read_text()))

    @staticmethod
    def ipac(name: bytes, extension: bytes, payload: bytes) -> bytes:
        dictionary_offset = 16
        data_offset = dictionary_offset + 20
        return (
            b"IPAC"
            + struct.pack("<III", dictionary_offset, 1, len(payload))
            + struct.pack(
                "<8s4sII",
                name.ljust(8, b"\0"),
                extension.ljust(4, b"\0"),
                data_offset,
                len(payload),
            )
            + payload
        )

    def test_reads_ipac_members(self):
        payload = b"MDO7" + b"\0" * 12
        archive = self.ipac(b"MAP", b"MAPM", payload)
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "MPK00.PKS"
            source.write_bytes(archive)
            members = ipac_members(source)
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0].name, "MAP")
        self.assertEqual(members[0].extension, "MAPM")
        self.assertEqual(members[0].data, payload)

    def test_finds_nested_texn_payloads_in_authored_order(self):
        def texn(texture_id: bytes, value: int) -> bytes:
            pvr = b"PVRT" + struct.pack("<I", 10) + bytes([0, 1, 0, 0, 1, 0, 1, 0, value, 0])
            return b"TEXN" + struct.pack("<I", 16 + len(pvr)) + texture_id + pvr

        first = texn(b"FIRST001", 1)
        second = texn(b"SECOND02", 2)
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "textures.pkf"
            source.write_bytes(b"prefix" + first + b"padding" + second)
            records = texture_records(source)
        self.assertEqual([record[0] for record in records], [b"FIRST001", b"SECOND02"])
        self.assertTrue(all(record[1].startswith(b"PVRT") for record in records))

    def test_stages_forensic_and_sanitized_viewer_manifests(self):
        model = b"MDO7" + b"\0" * 12
        pvr = b"PVRT" + struct.pack("<I", 10) + bytes(10)
        texn = b"TEXN" + struct.pack("<I", 16 + len(pvr)) + b"TEXTURE1" + pvr
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            zone = root / "disc" / "data" / "SCENE" / "01" / "TEST"
            zone.mkdir(parents=True)
            (zone / "MPK00.PKS").write_bytes(self.ipac(b"MAP", b"MAPM", model))
            (zone / "MPK00.PKF").write_bytes(texn)
            nested = zone / "PACK"
            nested.mkdir()
            (nested / "EVENT.PKS").write_bytes(self.ipac(b"ACTOR", b"CHRM", model))
            global_root = root / "disc" / "data" / "MODEL" / "ITEM"
            global_root.mkdir(parents=True)
            (global_root / "PROP.MT7").write_bytes(model)
            (global_root / "ZIPPED.MT7").write_bytes(gzip.compress(model))
            misc_root = root / "disc" / "data" / "MISC"
            misc_root.mkdir(parents=True)
            (misc_root / "SHARED.MT7").write_bytes(model)
            (misc_root / "MODELS.PKS").write_bytes(self.ipac(b"YKB_B", b"CHRM", model))
            (misc_root / "MODELS.PKF").write_bytes(texn)
            output = root / "output"

            report = stage_models(root / "disc", output, "S2_TEST")
            forensic = json.loads((output / "models.json").read_text())
            viewer = json.loads((output / "viewer-models.json").read_text())

        self.assertEqual(report["summary"]["modelCount"], 6)
        self.assertEqual(report["summary"]["sharedArchiveModelCount"], 1)
        self.assertTrue(any(item["filename"].endswith("ZIPPED.MT7") for item in forensic["models"]))
        self.assertIn("discRoot", forensic)
        self.assertIn("source", forensic["models"][0])
        self.assertNotIn("discRoot", viewer)
        self.assertNotIn("source", viewer["models"][0])
        self.assertEqual(len(forensic["texturePacks"][0]["sha256"]), 64)
        self.assertGreater(forensic["texturePacks"][0]["byteLength"], 0)


if __name__ == "__main__":
    unittest.main()
