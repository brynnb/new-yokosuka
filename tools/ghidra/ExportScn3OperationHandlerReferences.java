// Export exact code/data-pointer references made by SCN3 operation handlers.
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

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.symbol.Reference;

public class ExportScn3OperationHandlerReferences extends GhidraScript {
    private static final long TABLE_ADDRESS = 0x0c29a9e0L;
    private static final Pattern OPERATION_ID = Pattern.compile(
        "\\\"operationId\\\"\\s*:\\s*(\\d+)"
    );

    private Set<Integer> operationIds(File reportFile) throws Exception {
        String report = Files.readString(
            reportFile.toPath(),
            StandardCharsets.UTF_8
        );
        Set<Integer> result = new LinkedHashSet<>();
        Matcher matcher = OPERATION_ID.matcher(report);
        while (matcher.find()) {
            result.add(Integer.parseInt(matcher.group(1)));
        }
        return result;
    }

    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 2) {
            throw new IllegalArgumentException(
                "Expected <output-file> <operation-handler-report.json>"
            );
        }
        Set<Integer> operationIds = operationIds(new File(arguments[1]));
        if (operationIds.isEmpty()) {
            throw new IllegalArgumentException(
                "The report contains no operationId fields"
            );
        }

        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            output.println(
                "operationId\thandler\tinstruction\treferenceKind\t" +
                "referenceAddress\tpointerValue"
            );
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
                if (function == null) {
                    continue;
                }

                InstructionIterator instructions =
                    currentProgram.getListing().getInstructions(
                        function.getBody(),
                        true
                    );
                while (instructions.hasNext()) {
                    Instruction instruction = instructions.next();
                    for (Reference reference :
                         instruction.getReferencesFrom()) {
                        Address target = reference.getToAddress();
                        String pointerValue = "";
                        if (
                            target.isMemoryAddress() &&
                            currentProgram.getMemory().contains(target)
                        ) {
                            try {
                                long value = Integer.toUnsignedLong(
                                    currentProgram.getMemory().getInt(target)
                                );
                                if (
                                    0x0c000000L <= value &&
                                    value < 0x0d000000L
                                ) {
                                    pointerValue = String.format(
                                        "0x%08x",
                                        value
                                    );
                                }
                            } catch (Exception ignored) {
                                // Some references are narrower than a word.
                            }
                        }
                        output.printf(
                            "0x%04x\t%s\t%s\t%s\t%s\t%s%n",
                            operationId,
                            handler,
                            instruction.getAddress(),
                            reference.getReferenceType(),
                            target,
                            pointerValue
                        );
                    }
                }
            }
        }
    }
}
