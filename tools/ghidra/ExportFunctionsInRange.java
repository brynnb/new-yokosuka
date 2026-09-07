// Export every defined function whose entry point is in an address range.
// Usage: <output-file> <start-address> <end-address-exclusive>
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;

public class ExportFunctionsInRange extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 3) {
            throw new IllegalArgumentException(
                "Expected <output-file> <start-address> <end-address-exclusive>"
            );
        }

        Address start = toAddr(Long.decode(arguments[1]));
        Address end = toAddr(Long.decode(arguments[2]));
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            FunctionIterator functions = currentProgram
                .getFunctionManager()
                .getFunctions(start, true);
            while (functions.hasNext()) {
                Function function = functions.next();
                if (function.getEntryPoint().compareTo(end) >= 0) break;
                output.println(
                    "\n===== FUNCTION " + function.getName() + " @ "
                    + function.getEntryPoint() + " ====="
                );
                output.println("Body: " + function.getBody());
                DecompileResults result = decompiler.decompileFunction(
                    function,
                    120,
                    monitor
                );
                if (result.decompileCompleted()) {
                    output.println(result.getDecompiledFunction().getC());
                } else {
                    output.println(
                        "Decompile failed: " + result.getErrorMessage()
                    );
                }
            }
        } finally {
            decompiler.dispose();
        }
    }
}
