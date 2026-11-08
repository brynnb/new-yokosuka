"""Source-driven fallback side selection, independent of specific map IDs."""
import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).resolve().parents[1] / "tools/worlds/build_browser_map_transitions.py"
spec = importlib.util.spec_from_file_location("map_transitions", module_path)
transitions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transitions)


class InteriorSpawnEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.door = {"id": "exit", "source": {"area": "TEST", "nativeDoorObject": {
            "position": [0, 0, 3], "yawDegrees": 0,
        }}}

    def anchors(self, *residents):
        return {"anchors": [
            {"area": "TEST", "actor": name,
             "positions": [{"position": [0, 0, z]} for z in positions]}
            for name, positions in residents
        ]}

    def test_two_independent_residents_choose_the_opposite_side_and_facing(self):
        evidence = self.anchors(("A", [0, 0.2]), ("B", [-2]))
        spawn = transitions.face_away_from_entry_door(
            transitions.derived_interior_spawn(self.door, evidence))
        self.assertAlmostEqual(spawn["position"][2], 2.15)
        self.assertEqual(spawn["yawDegrees"], 180)
        self.assertEqual(spawn["evidence"]["residentAnchors"], ["A", "B"])

    def test_one_resident_conflicts_and_doorway_points_remain_unresolved(self):
        for evidence in (
            self.anchors(("A", [0])),
            self.anchors(("A", [0]), ("A", [-2])),
            self.anchors(("A", [0]), ("B", [6])),
            self.anchors(("A", [2.9]), ("B", [-2])),
            self.anchors(("A", [0, 6]), ("B", [-2])),
        ):
            with self.subTest(evidence=evidence):
                spawn = transitions.derived_interior_spawn(self.door, evidence)
                self.assertAlmostEqual(spawn["position"][2], 3.85)
                self.assertEqual(spawn["evidence"]["residentAnchors"], [])


if __name__ == "__main__":
    unittest.main()
