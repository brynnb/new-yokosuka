// Export decoded bytes from an analysed program memory range.
// Usage: <output-file> <start-address> <end-address-exclusive>
// @category Shenmue

import java.io.File;
import java.io.FileOutputStream;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;

public class ExportMemoryRange extends GhidraScript {
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
        long lengthLong = end.subtract(start);
        if (lengthLong <= 0 || lengthLong > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Invalid memory range");
        }
        byte[] bytes = new byte[(int) lengthLong];
        int read = currentProgram.getMemory().getBytes(start, bytes);
        if (read != bytes.length) {
            throw new IllegalStateException(
                "Read " + read + " of " + bytes.length + " bytes"
            );
        }
        try (FileOutputStream output = new FileOutputStream(
            new File(arguments[0])
        )) {
            output.write(bytes);
        }
        println(
            "Exported " + bytes.length + " bytes from " + start + " to " + end
        );
    }
}
