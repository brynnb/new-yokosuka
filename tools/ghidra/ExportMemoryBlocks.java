// Export the memory block layout of the current Ghidra program.
// Usage: <output-file>
// @category NewYokosuka

import java.io.File;
import java.io.PrintWriter;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.mem.MemoryBlock;

public class ExportMemoryBlocks extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length != 1) {
            throw new IllegalArgumentException("Expected <output-file>");
        }
        try (PrintWriter output = new PrintWriter(new File(arguments[0]))) {
            for (MemoryBlock block : currentProgram.getMemory().getBlocks()) {
                output.printf(
                    "%s %s-%s size=0x%x initialized=%s%n",
                    block.getName(), block.getStart(), block.getEnd(),
                    block.getSize(), block.isInitialized()
                );
            }
        }
    }
}
