# Decompile a small, explicit set of actor-controller functions and report
# their direct references. Run after normal analysis; this is intentionally
# scoped so research output stays outside the shipped runtime.

from ghidra.app.decompiler import DecompInterface


TARGETS = (
    0x0C0FEB8A,
    0x0C0FEB8E,
    0x0C0FEBC0,
    0x0C0FED8E,
    0x0C0FDD24,
    0x0C0FDE7E,
    0x0C0FDCB6,
    0x0C0FDED0,
    0x0C0FDF8C,
    0x0C0FD1FC,
    0x0C0FF116,
    0x0C0FF172,
    0x0C0FF32A,
    0x0C105E28,
    0x0C10609A,
    0x0C106416,
    0x0C10685C,
    0x0C107338,
)

FUNCTION_SEEDS = (
    (0x0C0FEB8A, "shenmue_actor_vmpt_record_callback"),
    (0x0C0FEB8E, "shenmue_actor_xmpt_record_callback"),
    (0x0C0FEBC0, "shenmue_actor_xmpt_request"),
    (0x0C0FED8E, "shenmue_actor_xmpt_state_query"),
    (0x0C0FDD24, "shenmue_actor_xmpt_install_look_point"),
    (0x0C0FDE7E, "shenmue_actor_xmpt_release_look_point"),
    (0x0C0FDCB6, "shenmue_actor_xmpt_prepare_target"),
    (0x0C0FDED0, "shenmue_actor_xmpt_apply_motion"),
    (0x0C0FDF8C, "shenmue_actor_xmpt_transform_target"),
    (0x0C0FD1FC, "shenmue_actor_xmpt_update"),
    (0x0C0FF116, "shenmue_actor_lkpt_record_callback"),
    (0x0C105E28, "shenmue_actor_lkpt_limit_angles"),
    (0x0C10609A, "shenmue_actor_angle_axis_initialize"),
    (0x0C106416, "shenmue_actor_angle_axis_update"),
    (0x0C10685C, "shenmue_actor_look_angles_update"),
    (0x0C107338, "shenmue_actor_lkpt_downstream_update"),
)

REFERENCE_TARGETS = (
    0x0C0FD1F8,
    0x0C0FDE14,
    0x0C0FDF6C,
    0x0C0FF2D8,
    0x0C0FF40C,
    0x0C107338,
    0x0C165FA8,
)


def containing_function(address):
    return currentProgram.getFunctionManager().getFunctionContaining(address)


decompiler = DecompInterface()
decompiler.openProgram(currentProgram)

for raw_address, name in FUNCTION_SEEDS:
    address = toAddr(raw_address)
    if getFunctionAt(address) is None:
        disassemble(address)
        createFunction(address, name)

for raw_address in REFERENCE_TARGETS:
    address = toAddr(raw_address)
    print("\n=== REFERENCES TO %s ===" % address)
    for reference in getReferencesTo(address):
        owner = containing_function(reference.getFromAddress())
        print(
            "%s %s %s"
            % (
                reference.getFromAddress(),
                reference.getReferenceType(),
                owner.getName() if owner else "<no-function>",
            )
        )

for raw_address in TARGETS:
    address = toAddr(raw_address)
    function = getFunctionAt(address)
    print("\n=== DECOMPILE %s ===" % address)
    if function is None:
        print("<no-function>")
        continue
    result = decompiler.decompileFunction(function, 120, monitor)
    decompiled = result.getDecompiledFunction()
    if decompiled is None:
        print("<decompile-failed: %s>" % result.getErrorMessage())
        continue
    source = decompiled.getC()
    if raw_address == 0x0C0FD1FC:
        start = source.find("switch(")
        if start >= 0:
            source = source[start:]
    print(source)

decompiler.dispose()
