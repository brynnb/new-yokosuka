import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.assets.process_disc3 import (  # noqa: E402
    ModelCandidate,
    build_disc3_stage,
    merge_catalog_entries,
    merge_disc3_stage,
    resolve_model_candidates,
    scene_model_name,
    texture_time_index,
)


class Disc3NamingTests(unittest.TestCase):
    def test_only_exact_map_pack_names_are_time_of_day_textures(self):
        self.assertEqual(texture_time_index("MAP0.PKS"), 0)
        self.assertEqual(texture_time_index("map3.pkf"), 3)
        self.assertEqual(texture_time_index("YORU.PKS"), 3)
        self.assertIsNone(texture_time_index("MAP01.MT5"))
        self.assertIsNone(texture_time_index("MAP12.MT5"))

    def test_scene_names_always_use_the_s3_zone_namespace(self):
        self.assertEqual(
            scene_model_name("ma00", "map_00.mapm"),
            "S3_MA00_MAP_00.MT5",
        )
        self.assertEqual(
            scene_model_name("mfsy", "PK BOX.chrm"),
            "S3_MFSY_PK_BOX.MT5",
        )

    def test_byte_different_archive_members_keep_distinct_names(self):
        canonical = "S3_MFSY_MAP.MT5"
        resolved, conflicts, duplicate_count = resolve_model_candidates(
            [
                ModelCandidate(
                    canonical,
                    b"disc-3-loose",
                    "MFSY/MAP.MT5",
                    "LOOSE",
                    True,
                ),
                ModelCandidate(
                    canonical,
                    b"disc-3-archive-variant",
                    "MFSY/RACE.PKS::MAP.MAPM",
                    "RACE",
                    False,
                ),
            ],
        )
        self.assertEqual(
            [model.output_name for model in resolved],
            ["S3_MFSY_MAP.MT5", "S3_MFSY_RACE_MAP.MT5"],
        )
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(duplicate_count, 0)


class Disc3CatalogTests(unittest.TestCase):
    def test_catalog_merge_preserves_existing_order_and_cross_disc_variants(self):
        existing = ["S1_D000_MAP.MT5", "S2_MFSY_MAP.MT5"]
        merged = merge_catalog_entries(
            existing,
            ["S3_MFSY_MAP.MT5", "S2_MFSY_MAP.MT5"],
        )
        self.assertEqual(merged[: len(existing)], existing)
        self.assertEqual(merged[-1], "S3_MFSY_MAP.MT5")


class Disc3NonDestructiveTests(unittest.TestCase):
    def _fixture(self, root: Path):
        disc_root = root / "disc" / "data"
        zone = disc_root / "SCENE" / "03" / "TEST"
        zone.mkdir(parents=True)
        (zone / "MAPINFO.BIN").write_bytes(b"mapinfo")
        (zone / "MAP.MT5").write_bytes(b"disc-three-model")
        for category in ("CHARA", "OBJECT", "ITEM"):
            (disc_root / "MODEL" / category).mkdir(parents=True)

        public_models = root / "public" / "models"
        public_models.mkdir(parents=True)
        sentinel = public_models / "S2_TEST_MAP.MT5"
        sentinel.write_bytes(b"existing-disc-two")
        catalog = root / "public" / "models.json"
        catalog.write_text(
            json.dumps(["S1_TEST_MAP.MT5", "S2_TEST_MAP.MT5"]),
            encoding="utf-8",
        )
        return disc_root, public_models, sentinel, catalog

    def test_default_staging_does_not_modify_public_assets_or_catalog(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            disc_root, public_models, sentinel, catalog = self._fixture(root)
            before_catalog = catalog.read_bytes()
            before_sentinel = sentinel.read_bytes()
            stage = root / "stage"

            audit = build_disc3_stage(
                disc_root,
                stage,
                catalog,
                public_models,
            )

            self.assertEqual(catalog.read_bytes(), before_catalog)
            self.assertEqual(sentinel.read_bytes(), before_sentinel)
            self.assertFalse(
                (public_models / "S3_TEST_MAP.MT5").exists(),
            )
            self.assertTrue((stage / "models" / "S3_TEST_MAP.MT5").is_file())
            self.assertEqual(audit["catalogBaseline"]["entryCount"], 2)

    def test_merge_preflight_refuses_byte_different_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            disc_root, public_models, _sentinel, catalog = self._fixture(root)
            stage = root / "stage"
            build_disc3_stage(disc_root, stage, catalog, public_models)

            collision = public_models / "S3_TEST_MAP.MT5"
            collision.write_bytes(b"different-existing-data")
            before_catalog = catalog.read_bytes()

            with self.assertRaises(FileExistsError):
                merge_disc3_stage(stage, catalog, public_models)

            self.assertEqual(catalog.read_bytes(), before_catalog)
            self.assertEqual(collision.read_bytes(), b"different-existing-data")

    def test_additive_merge_preserves_existing_files_and_catalog_prefix(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            disc_root, public_models, sentinel, catalog = self._fixture(root)
            stage = root / "stage"
            build_disc3_stage(disc_root, stage, catalog, public_models)
            before_entries = json.loads(catalog.read_text(encoding="utf-8"))
            before_sentinel = sentinel.read_bytes()

            result = merge_disc3_stage(stage, catalog, public_models)
            after_entries = json.loads(catalog.read_text(encoding="utf-8"))

            self.assertEqual(after_entries[: len(before_entries)], before_entries)
            self.assertEqual(after_entries[-1], "S3_TEST_MAP.MT5")
            self.assertEqual(sentinel.read_bytes(), before_sentinel)
            self.assertEqual(
                (public_models / "S3_TEST_MAP.MT5").read_bytes(),
                b"disc-three-model",
            )
            self.assertTrue(result["existingCatalogEntriesPreserved"])

    def test_existing_global_catalog_names_are_audited_not_restaged(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            disc_root, public_models, _sentinel, catalog = self._fixture(root)
            global_model = disc_root / "MODEL" / "ITEM" / "KNOWN.MT5"
            global_model.write_bytes(b"disc-three-global")
            entries = json.loads(catalog.read_text(encoding="utf-8"))
            entries.append("G_ITEM_KNOWN.MT5")
            catalog.write_text(json.dumps(entries), encoding="utf-8")
            stage = root / "stage"

            audit = build_disc3_stage(
                disc_root,
                stage,
                catalog,
                public_models,
            )

            self.assertFalse(
                (stage / "models" / "G_ITEM_KNOWN.MT5").exists(),
            )
            comparison = audit["globalComparison"]
            self.assertEqual(comparison["newGlobalModelCount"], 0)
            self.assertEqual(
                comparison["catalogMatchesWithoutLocalBinaryCount"],
                1,
            )

    def test_replace_stage_refuses_an_unmarked_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            disc_root, public_models, _sentinel, catalog = self._fixture(root)
            unsafe_stage = root / "not-a-disc3-stage"
            unsafe_stage.mkdir()
            user_file = unsafe_stage / "keep.txt"
            user_file.write_text("keep", encoding="utf-8")

            with self.assertRaises(ValueError):
                build_disc3_stage(
                    disc_root,
                    unsafe_stage,
                    catalog,
                    public_models,
                    replace_stage=True,
                )

            self.assertEqual(user_file.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
