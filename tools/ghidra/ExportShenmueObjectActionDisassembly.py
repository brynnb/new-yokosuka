# Export the unscrambled SH-4 listing for the 1ST_READ object-action region.
#
# The retail executable on disc is scrambled, while the Ghidra project holds
# the decoded instruction stream.  Keeping this exporter beside the analysis
# scripts makes the indirect callback search reproducible.
#
# The output path is the first script argument.
#
# @category Shenmue


arguments = getScriptArgs()
if not arguments:
    raise RuntimeError("Expected output path argument")

output_path = arguments[0]
address_space = currentProgram.getAddressFactory().getDefaultAddressSpace()
start_offset = int(arguments[1], 0) if len(arguments) > 1 else 0x0C0D0000
end_offset = int(arguments[2], 0) if len(arguments) > 2 else 0x0C0D7200
start = address_space.getAddress(start_offset)
end = address_space.getAddress(end_offset)
listing = currentProgram.getListing()
memory = currentProgram.getMemory()

with open(output_path, "w") as output:
    iterator = listing.getInstructions(start, True)
    count = 0
    while iterator.hasNext():
        instruction = iterator.next()
        if instruction.getAddress().compareTo(end) >= 0:
            break
        references = []
        for reference in instruction.getReferencesFrom():
            target = reference.getToAddress()
            if reference.getReferenceType().isData() and memory.contains(target):
                try:
                    value = memory.getInt(target) & 0xFFFFFFFF
                    references.append("[%s]=0x%08x" % (target, value))
                except Exception:
                    pass
        suffix = " ; " + ", ".join(references) if references else ""
        output.write(
            "%s  %-8s %s%s\n"
            % (
                instruction.getAddress(),
                instruction.getMnemonicString(),
                instruction.toString().split(None, 1)[1]
                if " " in instruction.toString()
                else "",
                suffix,
            )
        )
        count += 1

println("Exported %d object-action instructions to %s" % (count, output_path))
