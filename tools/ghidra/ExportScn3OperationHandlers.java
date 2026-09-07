// Decompile the exact SCN3 operation handlers named by an extractor report.
// Usage: <output-file> <operation-handler-report.json>
// @category Shenmue

import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class ExportScn3OperationHandlers extends GhidraScript {
    private static final long TABLE_ADDRESS = 0x0c29a9e0L;
    private static final Pattern OPERATION_ID = Pattern.compile(
        "\\\"operationId\\\"\\s*:\\s*(\\d+)"
    );

    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <operation-handler-report.json>"
            );
        }

        String report = Files.readString(
            new File(arguments[1]).toPath(),
            StandardCharsets.UTF_8
        );
        Set<Integer> operationIds = new LinkedHashSet<>();
        Matcher matcher = OPERATION_ID.matcher(report);
        while (matcher.find()) {
            operationIds.add(Integer.parseInt(matcher.group(1)));
        }
        if (operationIds.isEmpty()) {
            throw new IllegalArgumentException(
                "The report contains no operationId fields"
            );
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            output.println(
                "# Exact SCN3 operation handlers from table 0x0c29a9e0"
            );
            output.println("# operationCount=" + operationIds.size());
            for (int operationId : operationIds) {
                Address entry = toAddr(TABLE_ADDRESS + operationId * 4L);
                long handlerValue = Integer.toUnsignedLong(
                    currentProgram.getMemory().getInt(entry)
                );
                Address handler = toAddr(handlerValue);
                Function function = getFunctionAt(handler);
                if (function == null) {
                    function = createFunction(
                        handler,
                        "SCN3_OP_" + String.format("%04x", operationId)
                    );
                }

                output.println(
                    "\n===== operation 0x" +
                    String.format("%04x", operationId) +
                    " handler " + handler + " ====="
                );
                if (function == null) {
                    output.println("Unable to create function.");
                    continue;
                }
                output.println(
                    "Function: " + function.getName() +
                    " entry=" + function.getEntryPoint() +
                    " body=" + function.getBody()
                );
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
