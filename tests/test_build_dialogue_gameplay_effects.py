import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "build_dialogue_gameplay_effects",
    ROOT / "tools/scripting/build_dialogue_gameplay_effects.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def operation(semantic, operation_id, arguments, offset="0x120"):
    return {
        "kind": "engineOperation",
        "callFileOffset": offset,
        "operationId": operation_id,
        "operationHex": f"0x{operation_id:04x}",
        "arguments": arguments,
        "adapterStatus": "proven",
        "semanticId": semantic,
    }


def constant(value, ascii_value=None):
    result = {"kind": "constant", "value": value}
    if ascii_value:
        result["ascii"] = ascii_value
    return result


class DialogueGameplayEffectsTests(unittest.TestCase):
    def test_extracts_effects_without_flattening_control_flow(self):
        report = MODULE.build_report({
            "maps": [{
                "disc": 1,
                "area": "D000",
                "mapinfoSha256": "abc",
                "functions": [{
                    "id": "0x100",
                    "entryBlock": "0x100",
                    "dialogueRegion": {"voiceIds": ["E1000A001"]},
                    "unresolvedControlTransfers": [],
                    "blocks": [{
                        "id": "0x100",
                        "successors": ["0x140"],
                        "terminator": {"kind": "branch"},
                        "actions": [operation(
                            "native-free-conversation-control",
                            0x51,
                            [constant(12), constant(190), constant(1)],
                        )],
                    }],
                }],
            }],
        })
        self.assertEqual(report["summary"]["effectCount"], 1)
        effect = report["maps"][0]["functions"][0]["blocks"][0]["effects"][0]
        self.assertEqual(effect["kind"], "stateBankWrite")
        self.assertEqual(effect["bank"], 2)
        self.assertEqual(effect["index"]["value"], 190)
        self.assertEqual(effect["resolution"], "static")
        self.assertEqual(
            report["maps"][0]["functions"][0]["blocks"][0]["successors"],
            ["0x140"],
        )
        self.assertEqual(
            report["summary"]["stateBankTargetInventory"],
            [{
                "bank": 2,
                "index": 190,
                "writeCount": 1,
                "values": [1],
                "areas": ["D000"],
                "voiceIds": ["E1000A001"],
            }],
        )

    def test_runtime_operand_remains_explicit(self):
        effect = MODULE.normalized_effect(
            operation(
                "game-state-access",
                0x1AF,
                [
                    constant(0x41),
                    constant(0x4F544148, "HATO"),
                    {"kind": "runtime", "source": "@(12,r14)"},
                ],
            ),
            {
                "disc": 1,
                "area": "D000",
                "functionOffset": "0x100",
                "blockOffset": "0x100",
                "callOffset": "0x120",
                "operation": "0x01af",
            },
        )
        self.assertEqual(effect["kind"], "actorByteStateWrite")
        self.assertEqual(MODULE.resolution(effect), "runtime-bound")
        self.assertEqual(effect["value"]["source"], "@(12,r14)")

    def test_persistent_yen_write_remains_server_owned(self):
        effect = MODULE.normalized_effect(
            operation(
                "persistent-yen-write",
                0x60,
                [
                    constant(2),
                    {"kind": "runtime", "source": "@(32,r14)"},
                ],
            ),
            {
                "disc": 1,
                "area": "D000",
                "functionOffset": "0x100",
                "blockOffset": "0x100",
                "callOffset": "0x120",
                "operation": "0x0060",
            },
        )
        self.assertEqual(effect["kind"], "nativeOperation")
        self.assertEqual(effect["effectClass"], "economy")
        self.assertEqual(effect["persistence"], "server")
        self.assertEqual(effect["semanticId"], "persistent-yen-write")

    def test_new_native_record_and_vector_handlers_enter_the_catalog(self):
        expected = {
            "actor-face-clip-control-write": "actorState",
            "actor-controller-word-7c-write": "actorState",
            "actor-look-point-update-control": "actorPresentation",
            "actor-mhnd-controller-request": "actorPresentation",
            "actor-osag-node-byte-and-flag-set": "actorState",
            "global-runtime-controller-reset": "runtimeState",
            "global-runtime-controller-byte-selection": "runtimeState",
            "native-game-state-byte-control": "nativeControl",
            "native-operation-0194-control": "nativeControl",
            "resolved-object-base-vector-query": "objectTransform",
            "resolved-object-dword-5c-bit-6-control": "objectState",
            "resolved-object-indexed-vector-query": "objectTransform",
            "resolved-object-link-field-zero-write": "objectTransform",
            "resolved-object-xz-bounds-query": "objectTransform",
            "resolved-object-hndl-hndr-component-write": "associatedRecord",
            "resolved-object-hndl-hndr-vector-install": "associatedRecord",
            "resolved-object-hndl-hndr-controller-request": "associatedRecord",
            "resolved-object-fixo-attachment-install": "associatedRecord",
            "resolved-object-fixo-reset": "associatedRecord",
        }
        for semantic, effect_class in expected.items():
            with self.subTest(semantic=semantic):
                effect = MODULE.normalized_effect(
                    operation(semantic, 1, [constant(0)]),
                    {
                        "disc": 1,
                        "area": "D000",
                        "functionOffset": "0x100",
                        "blockOffset": "0x100",
                        "callOffset": "0x120",
                        "operation": "0x0001",
                    },
                )
                self.assertEqual(effect["kind"], "nativeOperation")
                self.assertEqual(effect["effectClass"], effect_class)
                self.assertEqual(effect["persistence"], "scene")

    def test_non_dialogue_functions_are_not_promoted(self):
        report = MODULE.build_report({
            "maps": [{
                "disc": 1,
                "area": "D000",
                "mapinfoSha256": "abc",
                "functions": [{
                    "id": "0x100",
                    "entryBlock": "0x100",
                    "dialogueRegion": None,
                    "unresolvedControlTransfers": [],
                    "blocks": [{
                        "id": "0x100",
                        "successors": [],
                        "actions": [operation(
                            "global-byte-state-write",
                            0xAC,
                            [constant(1)],
                        )],
                    }],
                }],
            }],
        })
        self.assertEqual(report["summary"]["effectCount"], 0)
        self.assertEqual(report["maps"], [])

    def test_reports_unresolved_operations_without_promoting_them(self):
        unresolved = operation("unknown", 0x66, [constant(3)])
        unresolved["adapterStatus"] = "unresolved"
        unresolved.pop("semanticId")
        unresolved["knownOperationFamily"] = "constrained-family"
        report = MODULE.build_report({
            "maps": [{
                "disc": 1,
                "area": "D000",
                "mapinfoSha256": "abc",
                "functions": [{
                    "id": "0x100",
                    "entryBlock": "0x100",
                    "dialogueRegion": {"voiceIds": ["E1000A001"]},
                    "unresolvedControlTransfers": [],
                    "blocks": [{
                        "id": "0x100",
                        "successors": [],
                        "actions": [unresolved],
                    }],
                }],
            }],
        })
        self.assertEqual(report["summary"]["effectCount"], 0)
        self.assertEqual(
            report["summary"]["unresolvedOperationCounts"],
            {"0x0066": 1},
        )
        self.assertEqual(
            report["summary"]["knownFamilyButUnresolvedCounts"],
            {"constrained-family": 1},
        )


if __name__ == "__main__":
    unittest.main()
