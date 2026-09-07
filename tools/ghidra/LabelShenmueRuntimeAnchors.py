# Label verified Shenmue Dreamcast SH-4 runtime anchors.
#
# Run as a Ghidra pre-script against the stock SuperH4:LE:32:default imports:
#
#   MAPINFO.BIN  base 0x0c3c5740
#   1ST_READ.BIN base 0x0c010000
#
# @category Shenmue

from ghidra.program.model.listing import CodeUnit
from ghidra.program.model.symbol import SourceType


def address(value):
    return currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(
        int(value)
    )


def label_function(value, name, comment):
    target = address(value)
    disassemble(target)
    function = getFunctionAt(target)
    if function is None:
        function = createFunction(target, name)
    elif function.getName() != name:
        function.setName(name, SourceType.USER_DEFINED)
    currentProgram.getListing().setComment(
        target,
        CodeUnit.PLATE_COMMENT,
        comment,
    )
    createLabel(target, name, True)


def label_address(value, name, comment):
    target = address(value)
    currentProgram.getListing().setComment(
        target,
        CodeUnit.PLATE_COMMENT,
        comment,
    )
    createLabel(target, name, True)


def label_containing_function(value, name, comment):
    target = address(value)
    function = getFunctionContaining(target)
    if function is None:
        disassemble(target)
        function = createFunction(target, name)
    currentProgram.getListing().setComment(
        function.getEntryPoint(),
        CodeUnit.PLATE_COMMENT,
        comment,
    )
    if target != function.getEntryPoint():
        createLabel(target, name + "_observed_write", True)


program_name = currentProgram.getName()

if program_name == "MAPINFO.BIN":
    label_function(
        0x0C3C5778,
        "jomo_room_entry",
        "JOMO MAPINFO.BIN file offset 0x38, mapped from runtime RAM.",
    )
    label_function(
        0x0C3D7420,
        "jomo_shared_selector_10",
        "Exported shared-object selector 10; file offset 0x11ce0.",
    )
    label_function(
        0x0C3D7690,
        "jomo_shared_selector_11",
        "Exported shared-object selector 11; file offset 0x11f50.",
    )
    label_function(
        0x0C41DBA4,
        "jomo_shared_selector_100",
        "Exported shared-object selector 100; file offset 0x58464.",
    )
    for selector, target, file_offset in [
        (0, 0x0C3DE004, 0x188C4),
        (1, 0x0C3DCBBC, 0x1747C),
        (2, 0x0C3D0FBC, 0x0B87C),
        (4, 0x0C3D4E76, 0x0F736),
        (5, 0x0C3CF37C, 0x09C3C),
        (12, 0x0C3D81E0, 0x12AA0),
        (13, 0x0C3C84A0, 0x02D60),
        (16, 0x0C3C747C, 0x01D3C),
        (17, 0x0C3C73B0, 0x01C70),
        (39, 0x0C3DFE2C, 0x1A6EC),
        (46, 0x0C4182B8, 0x52B78),
        (47, 0x0C3E11A4, 0x1BA64),
        (48, 0x0C3DF708, 0x19FC8),
        (49, 0x0C3E107A, 0x1B93A),
        (50, 0x0C3E1AF4, 0x1C3B4),
        (54, 0x0C3E1EC8, 0x1C788),
        (55, 0x0C402E40, 0x3D700),
        (62, 0x0C3E568C, 0x1FF4C),
        (63, 0x0C3E3844, 0x1E104),
        (85, 0x0C3ECFD8, 0x27898),
        (88, 0x0C3FF9CC, 0x3A28C),
    ]:
        label_function(
            target,
            "jomo_shared_selector_%d" % selector,
            "Exported shared-object selector %d; file offset 0x%x."
            % (selector, file_offset),
        )
    label_function(
        0x0C4489A4,
        "jomo_group_record_scan",
        "Shared-record scan containing the captured GGB1 path.",
    )
    label_function(
        0x0C448AA4,
        "jomo_group_record_read_loop",
        "Reads 32-byte shared records through engine operation 0x009a.",
    )
    label_function(
        0x0C448BA0,
        "jomo_selected_record_setup",
        "Looks up a selected 32-byte shared record, reads its fields, and "
        "configures engine action/controller slot 28.",
    )
    label_function(
        0x0C44995C,
        "jomo_shared_object_action_dispatch",
        "Common caller of the shared runtime-tag action path and literal "
        "object-action helpers.",
    )
    label_function(
        0x0C44673C,
        "jomo_group_object_action_coroutine",
        "Resolves the selected shared-object group callback and derives the "
        "engine selector used by operation 0x0139 mode 11.",
    )
    label_address(
        0x0C446E6C,
        "jomo_selected_callback_selector_load",
        "Loads the selected JOMO callback selector before engine-selector "
        "conversion.",
    )
    label_address(
        0x0C446E72,
        "jomo_engine_selector_subtract_one",
        "Computes engine selector = selected JOMO callback selector - 1. "
        "The captured GGB1 path converts 11 to 10.",
    )
    label_address(
        0x0C446EA6,
        "jomo_group_object_action_invoke",
        "Operation 0x0139 mode-11 call. Captured arguments were mode 11, "
        "tag GGB1, engine selector 10.",
    )
    label_function(
        0x0C44C810,
        "jomo_literal_object_action_coroutine",
        "Contains literal mode-11 object-action calls including IWWH.",
    )
    label_address(
        0x0C448AE2,
        "jomo_ggb_record_read_u16_call",
        "Captured operation-0x009a call while GGB1 was selected; "
        "MAPINFO.BIN file offset 0x833a2.",
    )
    label_address(
        0x0C448B40,
        "jomo_ggb_record_read_word_call",
        "Second captured operation-0x009a call while GGB1 was selected; "
        "MAPINFO.BIN file offset 0x83400.",
    )
    label_address(
        0x0C45FF3C,
        "jomo_shared_record_array",
        "Base passed to engine operation 0x009a. A leading control word is "
        "followed by the room's 32-byte shared-object records.",
    )
    label_address(
        0x0C460A80,
        "jomo_ggb1_static_record",
        "GGB1 exact 32-byte record, file offset 0x9b340, action ID 28.",
    )
    label_address(
        0x0C460AA0,
        "jomo_ggb2_static_record",
        "GGB2 exact 32-byte record, file offset 0x9b360, action ID 28.",
    )
    label_address(
        0x0C460EC0,
        "jomo_shared_group_1",
        "Shared group containing GGB1/GGB2; file offset 0x9b780.",
    )
    label_address(
        0x0C4628A0,
        "jomo_exported_function_table",
        "JOMO exported selector table; file offset 0x9d160.",
    )

elif program_name == "1ST_READ.BIN":
    label_function(
        0x0C0BB69C,
        "shenmue_room_operation_wrapper",
        "Room-script engine-operation wrapper observed in Flycast.",
    )
    label_function(
        0x0C0BB6FE,
        "shenmue_room_operation_dispatch",
        "Dispatcher for the engine operation table at runtime 0x0c29a9e0.",
    )
    label_function(
        0x0C0D29CC,
        "shenmue_object_position_x_interpolation_update_a",
        "Selector-10/11 per-frame update. Reads and writes MT5 node +0x20 "
        "(position X); contains the captured GGB1 writer.",
    )
    label_function(
        0x0C0D2D12,
        "shenmue_object_position_x_interpolation_update_b",
        "Second selector-10/11 per-frame path. Reads and writes MT5 node "
        "+0x20 (position X).",
    )
    label_function(
        0x0C0D3990,
        "shenmue_object_rotation_y_interpolation_update",
        "Selector-20/21 per-frame update. Reads and writes MT5 node +0x0c "
        "(fixed-turn rotation Y).",
    )
    label_function(
        0x0C0D6EAA,
        "shenmue_object_action_context_prepare",
        "Generic action-context setup called before selector dispatch. "
        "Captured with r4 pointing at the live GGB1 task and r1='GGB1'.",
    )
    label_function(
        0x0C0D6F68,
        "shenmue_object_node_route_resolve",
        "Recursive live-object node traversal captured while resolving "
        "GGB1 child route IDs 13 and 8.",
    )
    label_function(
        0x0C1DC5C0,
        "shenmue_memory_clear_or_copy",
        "Low-level memory helper called by generic object-action setup.",
    )
    label_function(
        0x0C0D1C40,
        "shenmue_object_action_selector_10_11",
        "Object-action selector 10/11 target. Copies MT5 node +0x20 "
        "(position X) into interpolation state.",
    )
    label_function(
        0x0C0D7110,
        "shenmue_object_interpolation_initialize",
        "Shared initializer called by selector families 0-3, 10/11, 20/21, "
        "30, 40, and 50. Captured resolving GGB1 route nodes 13 and 8.",
    )
    label_function(
        0x0C0D0C6C,
        "shenmue_object_action_selector_0_3",
        "Object-action selector family 0 through 3.",
    )
    label_function(
        0x0C0D2E70,
        "shenmue_object_action_selector_20_21",
        "Object-action selector family 20 and 21. Copies MT5 node +0x0c "
        "(fixed-turn rotation Y) into interpolation state.",
    )
    label_function(
        0x0C0D3C8C,
        "shenmue_object_action_selector_30",
        "Object-action selector 30.",
    )
    label_function(
        0x0C0D51B8,
        "shenmue_object_action_selector_40",
        "Object-action selector 40.",
    )
    label_function(
        0x0C0D5C56,
        "shenmue_object_action_selector_50",
        "Object-action selector 50.",
    )
    label_function(
        0x0C0D6898,
        "shenmue_object_action_selector_60",
        "Object-action selector 60.",
    )
    label_address(
        0x0C0D2AAA,
        "ggb1_child_position_x_writer",
        "All 25 captured GGB1 X-position writes came from this instruction.",
    )
    label_function(
        0x0C0CAE40,
        "shenmue_object_action_update_dispatch",
        "Per-frame dispatcher. Reads the saved object-action selector and "
        "routes 0-3, 10/11, 20/21, 30, 40, 50, and 60 to family managers.",
    )
    for manager, name, family in [
        (0x0C0CAFF4, "shenmue_object_action_update_0_3", "0-3"),
        (0x0C0CB3B8, "shenmue_object_action_update_10_11", "10/11"),
        (0x0C0CB884, "shenmue_object_action_update_20_21", "20/21"),
        (0x0C0CBC72, "shenmue_object_action_update_30", "30"),
        (0x0C0CBFD0, "shenmue_object_action_update_40", "40"),
        (0x0C0CC2E0, "shenmue_object_action_update_50", "50"),
        (0x0C0CC5EA, "shenmue_object_action_update_60", "60"),
    ]:
        label_function(
            manager,
            name,
            "Per-frame manager for object-action selector family %s." % family,
        )
    label_containing_function(
        0x0C0CAC5C,
        "shenmue_interpolation_state_vector_reset",
        "Observed clearing interpolation-state vector 0x0c491568..570.",
    )
    label_containing_function(
        0x0C0D1C60,
        "shenmue_interpolation_state_prepare",
        "Observed preparing captured GGB1 interpolation state.",
    )
    label_containing_function(
        0x0C0D1CA0,
        "shenmue_interpolation_curve_prepare",
        "Observed writing captured GGB1 interpolation curve values.",
    )
    label_containing_function(
        0x0C0D7250,
        "shenmue_interpolation_target_prepare",
        "Observed writing target parameters into captured GGB1 state.",
    )
    label_containing_function(
        0x0C1D14A4,
        "shenmue_vector_copy_reverse",
        "Shared reverse-order three-float copy used for interpolation vectors.",
    )
    label_containing_function(
        0x0C09F1EA,
        "shenmue_hmdl_position_vector_read",
        "Observed copying an HMDL position vector into interpolation state.",
    )
    label_function(
        0x0C157076,
        "shenmue_operation_00da",
        "Engine operation 0x00da, recovered from the captured runtime "
        "operation table.",
    )
    label_function(
        0x0C157678,
        "shenmue_operation_0019",
        "Engine operation 0x0019, recovered from the captured runtime "
        "operation table.",
    )
    label_function(
        0x0C15820A,
        "shenmue_hmdl_transform_operation",
        "Engine operation 0x00c9: named HMDL node transform.",
    )
    label_function(
        0x0C1644DC,
        "shenmue_operation_0066",
        "Engine operation 0x0066, recovered from the captured runtime "
        "operation table.",
    )
    label_function(
        0x0C1645F6,
        "shenmue_operation_006a",
        "Engine operation 0x006a. Passes a numeric controller/function ID "
        "and two arguments to the runtime controller invocation helper.",
    )
    label_function(
        0x0C0EC3B0,
        "shenmue_runtime_controller_invoke",
        "Indirect target used by operation 0x006a in the captured runtime.",
    )
    label_function(
        0x0C0EB0DC,
        "shenmue_controller_field_0",
        "Operation-0x0066 field/type selector 0 target.",
    )
    label_function(
        0x0C0EB1C8,
        "shenmue_controller_field_1",
        "Operation-0x0066 field/type selector 1 target.",
    )
    label_function(
        0x0C0EB1D0,
        "shenmue_controller_field_2",
        "Operation-0x0066 field/type selector 2 target.",
    )
    label_function(
        0x0C0EB390,
        "shenmue_controller_field_3",
        "Operation-0x0066 field/type selector 3 target.",
    )
    label_function(
        0x0C0EB398,
        "shenmue_controller_field_4",
        "Operation-0x0066 field/type selector 4 target.",
    )
    label_function(
        0x0C0EB4A8,
        "shenmue_controller_field_5",
        "Operation-0x0066 field/type selector 5 target.",
    )
    label_function(
        0x0C0EB5A6,
        "shenmue_controller_field_6",
        "Operation-0x0066 field/type selector 6 target.",
    )
    label_function(
        0x0C0EB63A,
        "shenmue_controller_field_7",
        "Operation-0x0066 field/type selector 7 target.",
    )
    label_function(
        0x0C0EB714,
        "shenmue_controller_field_8",
        "Operation-0x0066 field/type selector 8 target.",
    )
    label_function(
        0x0C0EB832,
        "shenmue_controller_field_9",
        "Operation-0x0066 field/type selector 9 target.",
    )
    label_function(
        0x0C0EB848,
        "shenmue_controller_field_10",
        "Operation-0x0066 field/type selector 10 target.",
    )
    label_function(
        0x0C0EB048,
        "shenmue_controller_field_11",
        "Operation-0x0066 field/type selector 11 target.",
    )
    label_function(
        0x0C17320C,
        "shenmue_operation_0009",
        "Engine operation 0x0009, recovered from the captured runtime "
        "operation table.",
    )
    label_function(
        0x0C1733A0,
        "shenmue_operation_004f",
        "Engine operation 0x004f, recovered from the captured runtime "
        "operation table.",
    )
    label_function(
        0x0C165544,
        "shenmue_operation_0139",
        "Engine operation 0x0139. Captured with selector 11, GGB1, and "
        "selector 10 in its descriptor.",
    )
    label_function(
        0x0C0CAC06,
        "shenmue_object_action_invoke",
        "Operation-0x0139 mode 11 target. Resolves a tagged live object and "
        "invokes its registered action callback with a selector.",
    )
    label_function(
        0x0C0CC74C,
        "shenmue_object_action_register",
        "Operation-0x0139 mode 14 target used by JOMO shared-object setup.",
    )
    label_function(
        0x0C0CCB14,
        "shenmue_object_action_link",
        "Operation-0x0139 mode 21 target used by JOMO shared-object setup.",
    )
    label_function(
        0x0C163736,
        "shenmue_operation_0184",
        "Engine operation 0x0184. Captured immediately after the shared "
        "record/group lookup for GGB1.",
    )
    label_function(
        0x0C1737B4,
        "shenmue_typed_indexed_table_operation",
        "Engine operation 0x009a. Reads or writes byte/word/dword/float "
        "elements selected by the descriptor's type and index.",
    )
    label_function(
        0x0C165B12,
        "shenmue_actor_motion_request_operation",
        "Engine operation 0x0028. Resolves its first argument as an actor, "
        "writes the second argument to the actor motion controller request "
        "at +0x66, clears controller status bit 1, and configures the "
        "request's float fields at +0xdc/+0x12c/+0x130/+0x134.",
    )
    label_function(
        0x0C165C48,
        "shenmue_actor_motion_status_operation",
        "Engine operation 0x0029. Resolves its actor argument, reads bit 1 "
        "from the associated motion controller, and returns that exact "
        "status value to the room-script VM.",
    )
    label_function(
        0x0C11453A,
        "shenmue_actor_motion_request_set",
        "Stores a 16-bit native motion request at controller +0x66 and "
        "clears controller status bit 1.",
    )
    label_function(
        0x0C11451A,
        "shenmue_actor_motion_status_bit_1",
        "Returns actor motion-controller status bit 1.",
    )
    label_function(
        0x0C165EAA,
        "shenmue_actor_look_point_operation",
        "Engine operation 0x002c. Resolves its actor argument and forwards "
        "the signed selector, three-float target pointer, and mode to the "
        "native LKPT controller.",
    )
    label_function(
        0x0C0FF172,
        "shenmue_actor_look_point_control",
        "Installs, updates, or releases an actor's 24-byte LKPT record, "
        "copies the exact world-space target vector, maps the selector into "
        "actor +0x84, and updates the associated actor control flags.",
    )

else:
    println("No Shenmue runtime anchors defined for %s" % program_name)
