# Export decompilation for the user-labelled Shenmue runtime anchors.
#
# The output path is the first script argument.
#
# @category Shenmue

from ghidra.app.decompiler import DecompInterface


arguments = getScriptArgs()
if not arguments:
    raise RuntimeError("Expected output path argument")

output_path = arguments[0]
decompiler = DecompInterface()
decompiler.openProgram(currentProgram)

functions = []
iterator = currentProgram.getFunctionManager().getFunctions(True)
while iterator.hasNext():
    function = iterator.next()
    if (
        function.getName().startswith("jomo_")
        or function.getName().startswith("shenmue_")
    ):
        functions.append(function)

functions.sort(key=lambda function: function.getEntryPoint().getOffset())

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

println("Exported %d anchor functions to %s" % (len(functions), output_path))
