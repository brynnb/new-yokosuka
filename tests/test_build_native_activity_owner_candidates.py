import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools.cutscenes.build_native_activity_owner_candidates import reviewed_activity_functions  # noqa: E402


def program(program_id, function_ids=("0x10", "0x20")):
    return {
        "id": program_id,
        "disc": 1,
        "area": "TEST",
        "functions": [{"id": value} for value in function_ids],
    }


class NativeActivityOwnerCandidateSourcesTest(unittest.TestCase):
    def test_routes_classify_only_their_selected_compiled_functions(self):
        reviewed, outside = reviewed_activity_functions(
            {
                "schema": "new-yokosuka-native-event-program-pack-v1",
                "programs": [program("reviewed"), program("canonical-extra")],
            },
            {
                "schema": "new-yokosuka-native-event-program-routes-v1",
                "routes": [{
                    "id": "reviewed",
                    "activityOwnerFunctions": ["0x20"],
                }],
            },
        )
        self.assertEqual(
            reviewed,
            {(1, "TEST", "0x20"): ["reviewed"]},
        )
        self.assertEqual(outside, ["canonical-extra"])

    def test_route_without_a_compiled_program_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError,
            "route missing has no compiled program",
        ):
            reviewed_activity_functions(
                {
                    "schema": "new-yokosuka-native-event-program-pack-v1",
                    "programs": [],
                },
                {
                    "schema": "new-yokosuka-native-event-program-routes-v1",
                    "routes": [{"id": "missing"}],
                },
            )

    def test_route_with_an_unavailable_owner_function_is_rejected(self):
        with self.assertRaisesRegex(
            ValueError,
            "reviewed has unavailable activity owner functions: 0x30",
        ):
            reviewed_activity_functions(
                {
                    "schema": "new-yokosuka-native-event-program-pack-v1",
                    "programs": [program("reviewed")],
                },
                {
                    "schema": "new-yokosuka-native-event-program-routes-v1",
                    "routes": [{
                        "id": "reviewed",
                        "activityOwnerFunctions": ["0x30"],
                    }],
                },
            )


if __name__ == "__main__":
    unittest.main()
