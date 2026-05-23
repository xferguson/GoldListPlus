export function nextBronzeTitle(existingTitles: string[]): string {
  const taken = new Set<number>();
  for (const title of existingTitles) {
    const match = /^Bronze ([1-9]\d*)$/.exec(title);
    if (match !== null) {
      taken.add(Number(match[1]));
    }
  }
  let n = 1;
  while (taken.has(n)) n += 1;
  return `Bronze ${n}`;
}
