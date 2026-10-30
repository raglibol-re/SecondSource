const STOP = new Set(
  'a an the and or but of for to in on at by with from as is are was were be been being has have had will would could should may might can says said say report reports reportedly considering consider sources source amid after before over under into about than that this those these it its his her their our your new breaking just'.split(
    ' '
  )
);

// Picks up to `max` search words from a headline: names and numbers first, then the rest, kept in headline order.
export const extractKeywords = (headline: string, max = 3): string[] => {
  const tokens = headline
    .replace(/[“”"'’:;,.!?()[\]]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t.toLowerCase()));
  const unique = [...new Map(tokens.map((t) => [t.toLowerCase(), t])).values()];
  const score = (t: string) => (/^[A-Z]/.test(t) ? 2 : 0) + (/\d/.test(t) ? 1 : 0) + t.length / 100;
  const picked = unique
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max);
  return picked.sort((a, b) => a.i - b.i).map((p) => p.t);
};
