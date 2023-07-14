export function filterObjectUndefined(object: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(object).filter(([_, value]) => value !== undefined)
  );
}
