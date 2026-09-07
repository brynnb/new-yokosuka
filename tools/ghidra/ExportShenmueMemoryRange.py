# Export decoded bytes from an analysed Shenmue executable memory range.
#
# Dreamcast executables are scrambled on disc.  Ghidra's program memory is
# already decoded, so this provides a reproducible input for external SH-4
# disassembly when a region has not yet been reached by Ghidra's control-flow
# analysis.
#
# Arguments: output path, start address, end address (exclusive).
#
# @category Shenmue

from jpype import JArray, JByte


arguments = getScriptArgs()
if len(arguments) != 3:
    raise RuntimeError("Expected output path, start address, and end address")

output_path = arguments[0]
start_offset = int(arguments[1], 0)
end_offset = int(arguments[2], 0)
if end_offset <= start_offset:
    raise RuntimeError("End address must be greater than start address")

address_space = currentProgram.getAddressFactory().getDefaultAddressSpace()
start = address_space.getAddress(start_offset)
length = end_offset - start_offset
buffer = JArray(JByte)(length)
read = currentProgram.getMemory().getBytes(start, buffer)
if read != length:
    raise RuntimeError("Read %d of %d requested bytes" % (read, length))

with open(output_path, "wb") as output:
    output.write(bytes((value & 0xFF) for value in buffer))

println(
    "Exported 0x%x decoded bytes from 0x%x to 0x%x into %s"
    % (length, start_offset, end_offset, output_path)
)
