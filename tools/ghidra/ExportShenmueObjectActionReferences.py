# Find code references to object-action state constants in 1ST_READ.
#
# The engine loads global addresses and large structure offsets through nearby
# literal pools.  Searching references to those literal values recovers users
# that Ghidra's function analysis may not have connected to the selector
# dispatcher.
#
# The output path is the first script argument.
#
# @category Shenmue


arguments = getScriptArgs()
if not arguments:
    raise RuntimeError("Expected output path argument")

output_path = arguments[0]
memory = currentProgram.getMemory()
listing = currentProgram.getListing()
reference_manager = currentProgram.getReferenceManager()
address_space = currentProgram.getAddressFactory().getDefaultAddressSpace()

targets = [
    ("object_action_state_pointer", 0x0C216498, 4),
    ("object_action_selector_offset", 0x0292, 2),
]


def find_values(value, width):
    byte_order = "little" if currentProgram.getLanguage().isBigEndian() is False else "big"
    needle = int(value).to_bytes(width, byteorder=byte_order, signed=False)
    result = []
    for block in memory.getBlocks():
        if not block.isInitialized():
            continue
        cursor = block.getStart()
        while cursor is not None and cursor.compareTo(block.getEnd()) <= 0:
            found = memory.findBytes(cursor, block.getEnd(), needle, None, True, monitor)
            if found is None:
                break
            result.append(found)
            cursor = found.add(1)
    return result


with open(output_path, "w") as output:
    output.write("program: %s\n\n" % currentProgram.getName())
    for name, value, width in targets:
        output.write("===== %s 0x%x/%d =====\n" % (name, value, width))
        for literal in find_values(value, width):
            references = reference_manager.getReferencesTo(literal)
            while references.hasNext():
                reference = references.next()
                source = reference.getFromAddress()
                instruction = listing.getInstructionAt(source)
                function = currentProgram.getFunctionManager().getFunctionContaining(source)
                output.write(
                    "%s literal=%s function=%s instruction=%s\n"
                    % (
                        source,
                        literal,
                        function.getName() if function is not None else "<none>",
                        instruction if instruction is not None else "<none>",
                    )
                )
        output.write("\n")

    output.write("===== pointers_into_object_action_region =====\n")
    seen = set()
    pointer_locations = {}
    for block in memory.getBlocks():
        if not block.isInitialized():
            continue
        cursor = block.getStart()
        while cursor.compareTo(block.getEnd()) <= 0:
            try:
                value = memory.getInt(cursor) & 0xFFFFFFFF
            except Exception:
                break
            if 0x0C0D0000 <= value < 0x0C0D7200:
                pointer_locations.setdefault(value, []).append(cursor)
                references = reference_manager.getReferencesTo(cursor)
                while references.hasNext():
                    reference = references.next()
                    source = reference.getFromAddress()
                    key = (source.getOffset(), cursor.getOffset(), value)
                    if key in seen:
                        continue
                    seen.add(key)
                    instruction = listing.getInstructionAt(source)
                    function = currentProgram.getFunctionManager().getFunctionContaining(source)
                    output.write(
                        "%s literal=%s value=0x%08x function=%s instruction=%s\n"
                        % (
                            source,
                            cursor,
                            value,
                            function.getName() if function is not None else "<none>",
                            instruction if instruction is not None else "<none>",
                        )
                    )
            cursor = cursor.add(4)
    output.write("\n===== all_aligned_pointer_values =====\n")
    for value in sorted(pointer_locations):
        locations = pointer_locations[value]
        output.write(
            "0x%08x count=%d locations=%s\n"
            % (
                value,
                len(locations),
                ",".join(str(location) for location in locations[:20]),
            )
        )
    output.write("\n===== dispatcher_table_words =====\n")
    table_start = address_space.getAddress(0x0C0CA000)
    table_end = address_space.getAddress(0x0C0CCD00)
    cursor = table_start
    while cursor.compareTo(table_end) < 0:
        value = memory.getInt(cursor) & 0xFFFFFFFF
        if 0x0C0D0000 <= value < 0x0C0D7200:
            words = []
            context = cursor.subtract(16)
            for _ in range(9):
                words.append("%s=%08x" % (context, memory.getInt(context) & 0xFFFFFFFF))
                context = context.add(4)
            output.write(" ".join(words) + "\n")
        cursor = cursor.add(4)

    output.write("\n===== pointers_into_dispatcher_tables =====\n")
    for block in memory.getBlocks():
        if not block.isInitialized():
            continue
        cursor = block.getStart()
        while cursor.compareTo(block.getEnd()) <= 0:
            try:
                value = memory.getInt(cursor) & 0xFFFFFFFF
            except Exception:
                break
            if 0x0C0CAF00 <= value < 0x0C0CCD00:
                references = reference_manager.getReferencesTo(cursor)
                ref_sources = []
                while references.hasNext():
                    ref_sources.append(str(references.next().getFromAddress()))
                output.write(
                    "%s -> 0x%08x refs=%s\n"
                    % (cursor, value, ",".join(ref_sources) if ref_sources else "-")
                )
            cursor = cursor.add(4)

println("Exported object-action constant references to %s" % output_path)
