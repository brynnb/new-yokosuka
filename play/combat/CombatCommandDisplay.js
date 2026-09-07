export function combatCommandGroups(input) {
  const groups = [];
  for (let index = 0; index < input.length; index += 1) {
    const group = [input[index]];
    if (
      input[index + 1] === "plus"
      && input[index + 2]
    ) {
      group.push("plus", input[index + 2]);
      index += 2;
    }
    groups.push(group);
  }
  return groups;
}

export function maximumCombatCommandGroupCount(inputs) {
  return Math.max(
    0,
    ...inputs.map((input) => combatCommandGroups(input).length),
  );
}

export function trimCombatCommandGroups(input, maximumGroups) {
  if (maximumGroups <= 0) return [];
  return combatCommandGroups(input)
    .slice(-maximumGroups)
    .flat();
}
