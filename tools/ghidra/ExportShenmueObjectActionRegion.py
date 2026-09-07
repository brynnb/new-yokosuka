# Export every recovered function in the 1ST_READ tagged-object action region.
#
# This deliberately includes unnamed functions.  The selector entry points
# install or prepare per-frame callbacks indirectly, so limiting an export to
# the labelled anchors hides the functions that perform the eventual MT5 node
# writes.
#
# The output path is the first script argument.
#
# @category Shenmue

from ghidra.app.decompiler import DecompInterface


arguments = getScriptArgs()
if not arguments:
    raise RuntimeError("Expected output path argument")

output_path = arguments[0]
address_factory = currentProgram.getAddressFactory()
start = address_factory.getDefaultAddressSpace().getAddress(0x0C0D0000)
end = address_factory.getDefaultAddressSpace().getAddress(0x0C0D7200)

decompiler = DecompInterface()
decompiler.openProgram(currentProgram)

functions = []
iterator = currentProgram.getFunctionManager().getFunctions(start, True)
while iterator.hasNext():
    function = iterator.next()
    entry = function.getEntryPoint()
    if entry.compareTo(end) >= 0:
        break
    functions.append(function)

with open(output_path, "w") as output:
    output.write("program: %s\n\n" % currentProgram.getName())
    for function in functions:
        output.write(
            "===== %s @ %s =====\n"
            % (function.getName(), function.getEntryPoint())
        )
        result = decompiler.decompileFunction(function, 60, monitor)
        if result.decompileCompleted():
            output.write(result.getDecompiledFunction().getC())
        else:
            output.write("DECOMPILATION FAILED: %s\n" % result.getErrorMessage())
        output.write("\n\n")

println("Exported %d object-action functions to %s" % (len(functions), output_path))
