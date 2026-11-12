import assert from "node:assert/strict";
import test from "node:test";
import { rankAssets, type Asset } from "../src/lib/capital.ts";

const assets: Asset[] = [
  { id: "A", type: "bridge", condition: 1, age: 40, criticality: 5, failures: 8, cost: 80 },
  { id: "B", type: "road", condition: 4, age: 10, criticality: 2, failures: 1, cost: 20 },
  { id: "C", type: "pump", condition: 2, age: 20, criticality: 3, failures: 4, cost: 30 },
];

test("capital ranking prioritizes risk per cost and stays within budget", () => {
  const ranked = rankAssets(assets, 50);
  assert.equal(ranked[0].id, "B");
  assert.equal(ranked.filter((asset) => asset.selected).reduce((total, asset) => total + asset.cost, 0), 50);
});

test("capital ranking accepts an empty plan and rejects invalid budgets", () => {
  assert.deepEqual(rankAssets(assets, 0).filter((asset) => asset.selected), []);
  assert.throws(() => rankAssets(assets, Number.NaN), /non-negative/);
});
