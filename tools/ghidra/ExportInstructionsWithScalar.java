// Export instructions containing an exact scalar operand value.
// Usage: <output-file> <hex-value> [<hex-value> ...]
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.scalar.Scalar;

public class ExportInstructionsWithScalar extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length < 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <hex-value> [<hex-value> ...]"
            );
        }
        Set<Long> values = new HashSet<>();
        for (int index = 1; index < arguments.length; index++) {
            values.add(Long.decode(arguments[index]));
        }

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (Instruction instruction : currentProgram.getListing()
                .getInstructions(true)) {
                boolean matches = false;
                for (int operand = 0;
                    operand < instruction.getNumOperands();
                    operand++) {
                    for (Object object : instruction.getOpObjects(operand)) {
                        if (object instanceof Scalar) {
                            Scalar scalar = (Scalar)object;
                            if (
                                values.contains(scalar.getUnsignedValue())
                                || values.contains(scalar.getSignedValue())
                            ) {
                                matches = true;
                            }
                        }
                    }
                }
                if (!matches) continue;
                Function function = getFunctionContaining(
                    instruction.getAddress()
                );
                output.println(
                    instruction.getAddress() + "  "
                    + instruction.toString() + "  function="
                    + (function == null ? "none" : function.getName())
                );
            }
        }
    }
}
