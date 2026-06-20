/** Update arrival timestamps for each word on the active path. */
export function updatePathReachedAt(
  reachedAt: number[],
  startTime: number,
  pathWords: string[],
  arrivalTime: number
): number[] {
  if (pathWords.length <= 1) {
    return [startTime];
  }

  const prefix =
    reachedAt.length >= pathWords.length - 1
      ? reachedAt.slice(0, pathWords.length - 1)
      : Array.from({ length: pathWords.length - 1 }, (_, index) => reachedAt[index] ?? startTime);

  prefix[0] = startTime;
  return [...prefix, arrivalTime];
}

/** Elapsed ms between each consecutive pair of nodes on the path. */
export function hopDurationsFromReachedAt(reachedAt: number[]): number[] {
  const durations: number[] = [];
  for (let index = 0; index < reachedAt.length - 1; index++) {
    durations.push(Math.max(0, reachedAt[index + 1]! - reachedAt[index]!));
  }
  return durations;
}
