# Enumerate executable references to native controller-field offsets involved
# in the MOMT numeric query. This stays low-level intentionally: it reports
# literal provenance and containing functions without assigning gameplay names.

from ghidra.app.decompiler import DecompInterface
from ghidra.program.model.scalar import Scalar


OFFSETS = (0xDC, 0xF0, 0x128, 0x194, 0x198, 0x19C)
SOURCE_MINIMUM = 0x0C10_C000
SOURCE_MAXIMUM = 0x0C115000
DECOMPILE_TARGETS = (
    0x0C093278,
    0x0C09BCD0,
    0x0C10C694,
    0x0C10D7F6,
    0x0C10DB04,
    0x0C10DC64,
    0x0C10ED58,
    0x0C11451A,
    0x0C11453A,
    0x0C114578,
)
KNOWN_LITERAL_ADDRESSES = (
    0x0C10DCF0,
    0x0C10DCF2,
    0x0C10DCF4,
    0x0C10DCF6,
    0x0C10DCF8,
    0x0C10DCFA,
    0x0C10DCFC,
    0x0C10DCFE,
    0x0C10DD00,
    0x0C10DD04,
    0x0C10DD08,
    0x0C10EF1C,
    0x0C10EF1E,
    0x0C10EF20,
    0x0C10EF22,
    0x0C10EF24,
    0x0C10EF26,
    0x0C10EF28,
    0x0C114694,
    0x0C114696,
    0x0C114698,
    0x0C10E344,
    0x0C10E346,
    0x0C10E348,
    0x0C10E34A,
    0x0C10E34C,
    0x0C10E34E,
    0x0C10E350,
    0x0C10E352,
    0x0C10E354,
    0x0C10E356,
)


listing = currentProgram.getListing()
memory = currentProgram.getMemory()
function_manager = currentProgram.getFunctionManager()
reference_manager = currentProgram.getReferenceManager()


def containing_function(address):
    return function_manager.getFunctionContaining(address)


def read_u16(address):
    return memory.getShort(address) & 0xFFFF


def read_u32(address):
    return memory.getInt(address) & 0xFFFFFFFF


print("=== KNOWN CONTROLLER UPDATE LITERAL POOL ===")
for raw_address in KNOWN_LITERAL_ADDRESSES:
    address = toAddr(raw_address)
    if not memory.contains(address):
        continue
    print(
        "%s u16=0x%04x u32=0x%08x"
        % (address, read_u16(address), read_u32(address))
    )


print("\n=== REFERENCED DEFINED SCALARS ===")
data_iterator = listing.getDefinedData(True)
while data_iterator.hasNext():
    data = data_iterator.next()
    value = data.getValue()
    if not isinstance(value, Scalar):
        continue
    scalar_value = value.getUnsignedValue()
    if scalar_value not in OFFSETS:
        continue
    references = list(reference_manager.getReferencesTo(data.getAddress()))
    if not references:
        continue
    scoped_references = [
        reference
        for reference in references
        if SOURCE_MINIMUM
        <= reference.getFromAddress().getOffset()
        < SOURCE_MAXIMUM
    ]
    if not scoped_references:
        continue
    print("\n%s value=0x%x" % (data.getAddress(), scalar_value))
    for reference in scoped_references:
        source = reference.getFromAddress()
        instruction = listing.getInstructionAt(source)
        owner = containing_function(source)
        owner_entry = owner.getEntryPoint() if owner else None
        print(
            "  %s %-20s owner=%s instruction=%s"
            % (
                source,
                str(reference.getReferenceType()),
                owner_entry if owner_entry else "<none>",
                instruction if instruction else "<none>",
            )
        )


requested_targets = tuple(
    int(value, 0)
    for value in getScriptArgs()
    if value.lower().startswith("0x")
)
decompile_targets = requested_targets or DECOMPILE_TARGETS

decompiler = DecompInterface()
decompiler.openProgram(currentProgram)
print("\n=== TARGET FUNCTIONS ===")
for raw_entry in decompile_targets:
    entry = toAddr(raw_entry)
    function = function_manager.getFunctionAt(entry)
    if function is None and memory.contains(entry):
        disassemble(entry)
        createFunction(entry, None)
        function = function_manager.getFunctionAt(entry)
    if function is None:
        print("\n===== %s <no-function> =====" % entry)
        continue
    print("\n===== %s %s =====" % (entry, function.getName()))
    print("--- instructions ---")
    instruction_iterator = listing.getInstructions(function.getBody(), True)
    while instruction_iterator.hasNext():
        instruction = instruction_iterator.next()
        print("%s  %s" % (instruction.getAddress(), instruction))
    print("--- decompile ---")
    result = decompiler.decompileFunction(function, 120, monitor)
    decompiled = result.getDecompiledFunction()
    if decompiled is None:
        print("<decompile-failed: %s>" % result.getErrorMessage())
    else:
        print(decompiled.getC())

decompiler.dispose()
