export function createInitialLedger(seriesBible) {
  return {
    seasonId: seriesBible.seasonId,
    updatedAt: new Date().toISOString(),
    lastGeneratedEpisode: 0,
    canonEvents: [],
    characterStates: (seriesBible.characters || []).map(character => ({
      characterId: character.id, name: character.name, currentState: "Belum muncul dalam episode."
    })),
    unresolvedThreads: [seriesBible.mainMystery].filter(Boolean),
    resolvedThreads: [],
    rules: seriesBible.worldRules || []
  };
}
export function applyEpisodeToLedger(ledger, story, review) {
  const next = JSON.parse(JSON.stringify(ledger));
  const update = story.continuityUpdate || {};
  const addUnique = (target, values) => {
    for (const value of values || []) {
      const normalized = typeof value === "string" ? value : JSON.stringify(value);
      if (normalized && !target.some(item => (typeof item === "string" ? item : JSON.stringify(item)) === normalized)) target.push(value);
    }
  };
  addUnique(next.canonEvents, update.canonEvents);
  addUnique(next.resolvedThreads, update.resolvedThreads);
  next.unresolvedThreads = next.unresolvedThreads.filter(thread => !(update.resolvedThreads || []).includes(thread));
  addUnique(next.unresolvedThreads, update.unresolvedThreads);
  for (const state of update.characterStates || []) {
    const index = next.characterStates.findIndex(item => item.characterId === state.characterId);
    if (index >= 0) next.characterStates[index] = { ...next.characterStates[index], currentState: state.state, lastUpdatedEpisode: story.episodeNumber };
    else next.characterStates.push({ ...state, lastUpdatedEpisode: story.episodeNumber });
  }
  next.lastGeneratedEpisode = story.episodeNumber;
  next.lastRetentionScore = review?.retentionScore ?? null;
  next.lastContinuityScore = review?.continuityScore ?? null;
  next.updatedAt = new Date().toISOString();
  return next;
}
