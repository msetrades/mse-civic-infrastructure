"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Asset = { id: string; type: string; condition: number; age: number; criticality: number; failures: number; cost: number };
type RankedAsset = Asset & { risk: number; priority: number; selected: boolean };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"' && quoted) { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function scoreAssets(text: string, budget: number): RankedAsset[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV needs a header and at least one asset row.");
  const headers = rows[0].map((h) => h.toLowerCase().replaceAll(" ", "_"));
  const required = ["asset_id", "type", "condition_1_5", "age_years", "criticality_1_5", "failures_24m", "repair_cost"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  const col = (name: string) => headers.indexOf(name);
  const parsed = rows.slice(1).map((r, index) => {
    const number = (key: string) => Number(r[col(key)]);
    const asset: Asset = {
      id: r[col("asset_id")], type: r[col("type")], condition: number("condition_1_5"), age: number("age_years"),
      criticality: number("criticality_1_5"), failures: number("failures_24m"), cost: number("repair_cost"),
    };
    if (!asset.id || !asset.type || ![asset.condition, asset.age, asset.criticality, asset.failures, asset.cost].every(Number.isFinite) || asset.condition < 1 || asset.condition > 5 || asset.criticality < 1 || asset.criticality > 5 || asset.age < 0 || asset.failures < 0 || asset.cost <= 0) {
      throw new Error(`Invalid values on data row ${index + 2}. Check condition and criticality (1-5), non-negative age/failures, and positive repair_cost.`);
    }
    return asset;
  });
  const maxAge = Math.max(1, ...parsed.map((a) => a.age));
  const maxFailures = Math.max(1, ...parsed.map((a) => a.failures));
  const ranked = parsed.map((a) => {
    const conditionRisk = (a.condition - 1) / 4;
    const ageRisk = Math.min(a.age / maxAge, 1);
    const historyRisk = Math.min(a.failures / maxFailures, 1);
    const risk = 100 * (0.4 * conditionRisk + 0.25 * ageRisk + 0.35 * historyRisk);
    return { ...a, risk, priority: risk * a.criticality, selected: false };
  }).sort((a, b) => b.priority / b.cost - a.priority / a.cost);
  let remaining = budget;
  return ranked.map((a) => {
    const selected = a.cost <= remaining;
    if (selected) remaining -= a.cost;
    return { ...a, selected };
  });
}

export default function Home() {
  const [assets, setAssets] = useState<RankedAsset[]>([]);
  const [budget, setBudget] = useState(250000);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const selected = useMemo(() => assets.filter((a) => a.selected), [assets]);
  const totalCost = selected.reduce((sum, a) => sum + a.cost, 0);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setError("");
    try { setAssets(scoreAssets(await file.text(), budget)); setFileName(file.name); }
    catch (e) { setAssets([]); setError(e instanceof Error ? e.message : "Unable to process this file."); }
  };
  const rerun = async () => {
    if (!fileName) return;
    const input = document.querySelector<HTMLInputElement>("#asset-file");
    if (!input?.files?.[0]) return;
    try { setAssets(scoreAssets(await input.files[0].text(), budget)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to process this file."); }
  };
  const exportPlan = () => {
    const csv = ["asset_id,type,condition,age_years,criticality,failures_24m,repair_cost,risk_score,priority_score,selected", ...assets.map((a) => [a.id,a.type,a.condition,a.age,a.criticality,a.failures,a.cost,a.risk.toFixed(1),a.priority.toFixed(1),a.selected].join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "civic-repair-priorities.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  return <main className="shell">
    <aside className="rail"><div className="brand"><span className="brand-mark">M</span><span>MSE / CIVIC SYSTEMS</span></div><nav><a className="active">Portfolio overview</a><a>Asset register</a><a>Risk &amp; criticality</a><a>Capital plan</a><a>Method &amp; assumptions</a></nav><div className="rail-note">DECISION SUPPORT<br/><span>Local analysis. Your asset file stays in this browser.</span></div></aside>
    <section className="content"><header className="topline"><span>INFRASTRUCTURE INTELLIGENCE / WORKSPACE</span><span className="status"><i/> READY FOR DATA</span></header>
      <div className="hero"><div><p className="eyebrow">CAPITAL PLANNING / 01</p><h1>Repair the assets<br/>that matter most.</h1><p className="lead">Turn condition, failure history, criticality, and repair cost into a transparent, budget-aware intervention plan.</p></div><div className="hero-index">01 <span>/ 10</span></div></div>
      <section className="panel import-panel"><div><p className="eyebrow">01 — LOAD YOUR REGISTER</p><h2>Start with your asset data</h2><p className="muted">CSV columns: <code>asset_id, type, condition_1_5, age_years, criticality_1_5, failures_24m, repair_cost</code></p></div><label className="upload">{fileName ? `Replace ${fileName}` : "Choose asset CSV"}<input id="asset-file" type="file" accept=".csv,text/csv" onChange={handleFile}/></label></section>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="control-row"><div><p className="eyebrow">02 — SET CAPITAL CONSTRAINT</p><label htmlFor="budget">Available repair budget</label></div><div className="budget"><span>$</span><input id="budget" type="number" min="0" value={budget} onChange={(e) => setBudget(Number(e.target.value))} onBlur={rerun}/><button onClick={rerun}>Recalculate plan <b>↗</b></button></div></section>
      <section className="metrics"><article><span>ASSETS ASSESSED</span><strong>{assets.length || "—"}</strong><small>Validated register rows</small></article><article><span>RECOMMENDED REPAIRS</span><strong>{assets.length ? selected.length : "—"}</strong><small>Selected within budget</small></article><article><span>CAPITAL ALLOCATED</span><strong>{assets.length ? `$${totalCost.toLocaleString()}` : "—"}</strong><small>{assets.length ? `${((totalCost / Math.max(1, budget)) * 100).toFixed(0)}% of available budget` : "Awaiting asset data"}</small></article></section>
      <section className="panel table-panel"><div className="table-head"><div><p className="eyebrow">03 — DECISION QUEUE</p><h2>Intervention priorities</h2></div><button className="secondary" onClick={exportPlan} disabled={!assets.length}>Export plan <b>↓</b></button></div>{assets.length ? <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>TYPE</th><th>RISK</th><th>CRITICALITY</th><th>REPAIR COST</th><th>PLAN</th></tr></thead><tbody>{assets.map((a) => <tr key={a.id}><td><strong>{a.id}</strong><small>{a.failures} failures / 24 mo</small></td><td>{a.type}</td><td><span className={`risk ${a.risk > 65 ? "high" : a.risk > 35 ? "mid" : "low"}`}>{a.risk.toFixed(0)} / 100</span></td><td>{a.criticality} / 5</td><td>${a.cost.toLocaleString()}</td><td>{a.selected ? <span className="included">IN PLAN</span> : <span className="deferred">DEFERRED</span>}</td></tr>)}</tbody></table></div> : <div className="empty"><span>CSV</span><p>Your ranked repair queue will appear here once an asset register is loaded.</p><small>No example records are inserted; analysis only runs on data you provide.</small></div>}</section>
      <footer><span>MSE CIVIC INFRASTRUCTURE / PRIVATE-BY-DESIGN</span><span>Risk score is a screening aid, not an engineering inspection.</span></footer>
    </section>
  </main>;
}
