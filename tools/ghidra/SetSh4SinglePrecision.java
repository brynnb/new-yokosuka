// Give the decompiler the native motion handlers' single-precision FPU mode.
// Use only for characterized SH-4 floating-point code, in a read-only project.
// @category Shenmue
import java.math.BigInteger;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.lang.Register;

public class SetSh4SinglePrecision extends GhidraScript {
    @Override
    protected void run() throws Exception {
        for (String name : new String[] { "FPSCR_PR", "FPSCR_SZ" }) {
            Register register = currentProgram.getRegister(name);
            if (register == null) throw new IllegalArgumentException("Missing " + name);
            currentProgram.getProgramContext().setValue(register,
                currentProgram.getMinAddress(), currentProgram.getMaxAddress(), BigInteger.ZERO);
        }
    }
}
