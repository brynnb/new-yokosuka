# Export call-graph paths from JOMO's shared selectors to operation-0x0139
# mode-11 tagged-object action sites.
#
# Arguments:
#   1. jomo-object-operation-trace.json
#   2. output JSON path
#
# @category Shenmue

import json
from collections import deque


arguments = getScriptArgs()
if len(arguments) != 2:
    raise RuntimeError("Expected evidence input and output paths")

evidence_path, output_path = arguments
with open(evidence_path, "r") as source:
    evidence = json.load(source)

address_space = currentProgram.getAddressFactory().getDefaultAddressSpace()
listing = currentProgram.getListing()
reference_manager = currentProgram.getReferenceManager()
function_manager = currentProgram.getFunctionManager()


def address(value):
    return address_space.getAddress(int(value))


def function_key(function):
    return int(function.getEntryPoint().getOffset())


def function_json(function):
    return {
        "name": function.getName(),
        "runtimeAddress": "0x%08x" % function_key(function),
    }


def outgoing_functions(function):
    targets = {}
    instructions = listing.getInstructions(function.getBody(), True)
    while instructions.hasNext():
        instruction = instructions.next()
        references = reference_manager.getReferencesFrom(instruction.getAddress())
        for reference in references:
            reference_type = reference.getReferenceType()
            if not (reference_type.isCall() or reference_type.isJump()):
                continue
            target = function_manager.getFunctionContaining(reference.getToAddress())
            if target is None or target == function:
                continue
            targets[function_key(target)] = target
    return list(targets.values())


def incoming_functions(function):
    sources = {}
    addresses = function.getBody().getAddresses(True)
    while addresses.hasNext():
        target_address = addresses.next()
        references = reference_manager.getReferencesTo(target_address)
        for reference in references:
            reference_type = reference.getReferenceType()
            if not (reference_type.isCall() or reference_type.isJump()):
                continue
            source = function_manager.getFunctionContaining(reference.getFromAddress())
            if source is None or source == function:
                continue
            sources[function_key(source)] = source
    return list(sources.values())


mode_11_sites = []
for call in evidence.get("objectActionCalls", []):
    arguments_json = call.get("arguments", [])
    if not arguments_json or arguments_json[0].get("value") != 11:
        continue
    file_offset = int(call["callFileOffset"], 16)
    runtime_address = 0x0C3C5740 + file_offset
    function = function_manager.getFunctionContaining(address(runtime_address))
    site = {
        "fileOffset": call["callFileOffset"],
        "runtimeAddress": "0x%08x" % runtime_address,
        "arguments": arguments_json,
        "function": function_json(function) if function is not None else None,
    }
    if function is not None:
        site["incomingFunctions"] = [
            function_json(source)
            for source in incoming_functions(function)
        ]
    mode_11_sites.append(site)

target_functions = {}
for site in mode_11_sites:
    if site["function"] is not None:
        target_functions[int(site["function"]["runtimeAddress"], 16)] = site

selectors = []
symbols = currentProgram.getSymbolTable().getAllSymbols(True)
while symbols.hasNext():
    symbol = symbols.next()
    name = symbol.getName()
    if not name.startswith("jomo_shared_selector_"):
        continue
    function = function_manager.getFunctionAt(symbol.getAddress())
    if function is None:
        continue

    start_key = function_key(function)
    queue = deque([(function, [function])])
    visited = {start_key}
    paths = []
    while queue:
        current, path = queue.popleft()
        current_key = function_key(current)
        if current_key in target_functions:
            paths.append(
                {
                    "site": target_functions[current_key],
                    "callPath": [function_json(entry) for entry in path],
                }
            )
            continue
        if len(path) >= 32:
            continue
        for target in outgoing_functions(current):
            target_key = function_key(target)
            if target_key in visited:
                continue
            visited.add(target_key)
            queue.append((target, path + [target]))

    selectors.append(
        {
            "selector": int(name.rsplit("_", 1)[1]),
            "function": function_json(function),
            "reachableMode11Actions": paths,
            "visitedFunctionCount": len(visited),
        }
    )

selectors.sort(key=lambda entry: entry["selector"])
result = {
    "schema": "new-yokosuka-jomo-selector-action-paths-v1",
    "source": currentProgram.getName(),
    "mode11Sites": mode_11_sites,
    "selectors": selectors,
}
with open(output_path, "w") as output:
    json.dump(result, output, indent=2)
    output.write("\n")

println(
    "Exported %d selectors and %d mode-11 sites to %s"
    % (len(selectors), len(mode_11_sites), output_path)
)
