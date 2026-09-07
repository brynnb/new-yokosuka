// Export decompilation for explicitly requested function addresses.
// First argument is the output path; remaining arguments are addresses.
// @category Shenmue

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.io.FileWriter;
import java.io.PrintWriter;

public class ExportFunctionsByAddress extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected output path and at least one address"
            );
        }
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        try (PrintWriter output = new PrintWriter(
            new FileWriter(arguments[0])
        )) {
            output.printf("program: %s%n%n", currentProgram.getName());
            for (int index = 1; index < arguments.length; index++) {
                Address address = toAddr(arguments[index]);
                Function function = getFunctionAt(address);
                if (function == null) {
                    function = getFunctionContaining(address);
                }
                if (function == null) {
                    disassemble(address);
                    function = createFunction(address, null);
                }
                if (function == null) {
                    output.printf(
                        "===== NO FUNCTION @ %s =====%n%n", address
                    );
                    continue;
                }
                output.printf(
                    "===== %s @ %s =====%n",
                    function.getName(),
                    function.getEntryPoint()
                );
                DecompileResults result = decompiler.decompileFunction(
                    function, 60, monitor
                );
                if (result.decompileCompleted()) {
                    output.print(
                        result.getDecompiledFunction().getC()
                    );
                } else {
                    output.printf(
                        "DECOMPILATION FAILED: %s%n",
                        result.getErrorMessage()
                    );
                }
                output.println();
            }
        }
    }
}
