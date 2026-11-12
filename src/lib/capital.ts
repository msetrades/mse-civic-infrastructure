export type Asset = { id: string; type: string; condition: number; age: number; criticality: number; failures: number; cost: number };
export type RankedAsset = Asset & { risk: number; priority: number; selected: boolean };

export function rankAssets(parsed: Asset[], budget: number): RankedAsset[] {
  if (!Number.isFinite(budget) || budget < 0) throw new Error("Budget must be a non-negative number.");
  const maxAge = Math.max(1, ...parsed.map((asset) => asset.age));
  const maxFailures = Math.max(1, ...parsed.map((asset) => asset.failures));
  const ranked = parsed.map((asset) => {
    const conditionRisk = (asset.condition - 1) / 4;
    const ageRisk = Math.min(asset.age / maxAge, 1);
    const historyRisk = Math.min(asset.failures / maxFailures, 1);
    const risk = 100 * (0.4 * conditionRisk + 0.25 * ageRisk + 0.35 * historyRisk);
    return { ...asset, risk, priority: risk * asset.criticality, selected: false };
  }).sort((a, b) => b.priority / b.cost - a.priority / a.cost);

  let remaining = budget;
  return ranked.map((asset) => {
    const selected = asset.cost <= remaining;
    if (selected) remaining -= asset.cost;
    return { ...asset, selected };
  });
}
