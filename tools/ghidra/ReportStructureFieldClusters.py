# Report functions whose instructions reference several requested structure
# displacements. Usage: <minimum-distinct> <offset> [<offset> ...]
#
# @category Shenmue

from collections import defaultdict
import re

from ghidra.program.model.scalar import Scalar


arguments = getScriptArgs()
if len(arguments) < 2:
    raise RuntimeError("Expected <minimum-distinct> <offset> [<offset> ...]")

minimum_distinct = int(arguments[0], 0)
offsets = set(int(value, 0) for value in arguments[1:])
listing = currentProgram.getListing()
function_manager = currentProgram.getFunctionManager()
matches = defaultdict(list)

instructions = listing.getInstructions(True)
while instructions.hasNext():
    instruction = instructions.next()
    rendered = str(instruction)
    if "@(" not in rendered or ",r15)" in rendered or ",GBR)" in rendered:
        continue
    values_by_base = defaultdict(set)
    for operand_index in range(instruction.getNumOperands()):
        for item in instruction.getOpObjects(operand_index):
            if isinstance(item, Scalar):
                value = item.getUnsignedValue()
                if value not in offsets:
                    continue
                pattern = r"@\(0x%x,(r\d+|GBR)\)" % value
                for base in re.findall(pattern, rendered):
                    values_by_base[base].add(value)
    if not values_by_base:
        continue
    owner = function_manager.getFunctionContaining(instruction.getAddress())
    if owner is None:
        continue
    for base, values in values_by_base.items():
        matches[(owner, base)].append((instruction, values))

ranked = []
for (owner, base), rows in matches.items():
    distinct = set()
    for _, values in rows:
        distinct.update(values)
    if len(distinct) >= minimum_distinct:
        ranked.append((
            len(distinct), owner.getEntryPoint().getOffset(), owner, base, rows,
        ))

for count, _, owner, base, rows in sorted(
    ranked, key=lambda item: (-item[0], item[1]),
):
    distinct = sorted(set(value for _, values in rows for value in values))
    print(
        "\n===== %s @ %s base=%s fields=%s ====="
        % (
            owner.getName(), owner.getEntryPoint(), base,
            [hex(value) for value in distinct],
        )
    )
    for instruction, values in rows:
        print(
            "%s fields=%s %s"
            % (
                instruction.getAddress(),
                [hex(value) for value in sorted(values)],
                instruction,
            )
        )

print("\nMatched %d functions." % len(ranked))
