"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { rankAssets, type Asset, type RankedAsset } from "@/lib/capital";

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
  if (rows.length > 50001) throw new Error("This workspace accepts up to 50,000 assets per import.");
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
    if (!asset.id || !asset.type || ![asset.condition, asset.age, asset.criticality, asset.failures, asset.cost].every(Number.isFinite) || !Number.isInteger(asset.condition) || !Number.isInteger(asset.criticality) || !Number.isInteger(asset.failures) || asset.condition < 1 || asset.condition > 5 || asset.criticality < 1 || asset.criticality > 5 || asset.age < 0 || asset.failures < 0 || asset.cost <= 0) {
      throw new Error(`Invalid values on data row ${index + 2}. Check condition and criticality (1-5), non-negative age/failures, and positive repair_cost.`);
    }
    return asset;
  });
  if (new Set(parsed.map((a) => a.id)).size !== parsed.length) throw new Error("Asset IDs must be unique within the CSV.");
  return rankAssets(parsed, budget);
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [assetDatabaseIds, setAssetDatabaseIds] = useState<Map<string, string>>(new Map());
  const [assets, setAssets] = useState<RankedAsset[]>([]);
  const [budget, setBudget] = useState(250000);
  const budgetRef = useRef(250000);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const selected = useMemo(() => assets.filter((a) => a.selected), [assets]);
  const totalCost = selected.reduce((sum, a) => sum + a.cost, 0);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      setOrganizationId("");
      setAssets([]);
      setWorkspaceReady(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void supabase.schema("civic").from("organizations").select("id,name").order("created_at", { ascending: true }).limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setNotice(`Could not load workspace: ${error.message}`); setWorkspaceReady(true); return; }
        const organization = data?.[0];
        if (!organization) { setWorkspaceReady(true); return; }
        setOrganizationId(organization.id);
        setOrganizationName(organization.name);
      });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!supabase || !organizationId) return;
    let cancelled = false;
    void supabase.schema("civic").from("infrastructure_assets")
      .select("id,asset_code,asset_type,condition_rating,criticality_rating,failures_24m,estimated_repair_cost,commissioned_on")
      .eq("organization_id", organizationId).order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setNotice(`Could not load assets: ${error.message}`);
        else {
          setAssetDatabaseIds(new Map((data ?? []).map((row) => [row.asset_code, row.id])));
          const loaded = (data ?? []).map((row) => ({
            id: row.asset_code,
            type: row.asset_type,
            condition: row.condition_rating,
            age: row.commissioned_on ? Math.max(0, (Date.now() - new Date(row.commissioned_on).getTime()) / 31_557_600_000) : 0,
            criticality: row.criticality_rating,
            failures: row.failures_24m,
            cost: Number(row.estimated_repair_cost),
          }));
          setAssets(rankAssets(loaded, budgetRef.current));
        }
        setWorkspaceReady(true);
      });
    return () => { cancelled = true; };
  }, [organizationId]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setAuthMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email to confirm your account, then sign in here.");
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !session?.user) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.schema("civic").from("organizations")
      .insert({ name: organizationName.trim(), created_by: session.user.id }).select("id,name").single();
    setBusy(false);
    if (error) setNotice(`Could not create workspace: ${error.message}`);
    else { setOrganizationId(data.id); setOrganizationName(data.name); setWorkspaceReady(false); }
  };

  const persistAssets = async (parsed: RankedAsset[]) => {
    if (!supabase || !session?.user || !organizationId) return;
    const imported = parsed.map((asset) => ({
      organization_id: organizationId,
      asset_code: asset.id,
      asset_type: asset.type,
      display_name: asset.id,
      condition_rating: Math.round(asset.condition),
      criticality_rating: Math.round(asset.criticality),
      failures_24m: Math.round(asset.failures),
      estimated_repair_cost: asset.cost,
      commissioned_on: new Date(Date.now() - asset.age * 31_557_600_000).toISOString().slice(0, 10),
      created_by: session.user.id,
    }));
    const { error } = await supabase.schema("civic").from("infrastructure_assets")
      .upsert(imported, { onConflict: "organization_id,asset_code" });
    if (error) throw error;
    const { data, error: readError } = await supabase.schema("civic").from("infrastructure_assets")
      .select("id,asset_code").eq("organization_id", organizationId).in("asset_code", parsed.map((a) => a.id));
    if (readError) throw readError;
    setAssetDatabaseIds((old) => new Map([...old, ...(data ?? []).map((row) => [row.asset_code, row.id] as [string, string])]));
  };

  const savePlan = async () => {
    if (!supabase || !session?.user || !organizationId || !assets.length || assets.some((asset) => !assetDatabaseIds.has(asset.id))) return;
    setBusy(true); setNotice("");
    const { data: scenario, error } = await supabase.schema("civic").from("capital_scenarios")
      .insert({ organization_id: organizationId, name: `Budget plan ${new Date().toLocaleDateString()}`, budget, scoring_version: "risk-cost-v1", assumptions: { condition_weight: 0.4, age_weight: 0.25, failure_history_weight: 0.35 }, created_by: session.user.id })
      .select("id").single();
    if (!error && scenario) {
      const { error: itemError } = await supabase.schema("civic").from("capital_scenario_items").insert(assets.map((asset, index) => ({
        organization_id: organizationId, scenario_id: scenario.id, asset_id: assetDatabaseIds.get(asset.id),
        risk_score: Number(asset.risk.toFixed(3)), consequence_score: Number(asset.priority.toFixed(3)),
        estimated_cost: asset.cost, selected_for_plan: asset.selected, rank: index + 1,
      })));
      if (itemError) setNotice(`Plan header saved, but item details failed: ${itemError.message}`);
      else setNotice("Budget plan saved to the Civic workspace.");
    } else setNotice(`Could not save plan: ${error?.message ?? "Unknown database error"}`);
    setBusy(false);
  };
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setError(""); setBusy(true);
    try {
      const next = scoreAssets(await file.text(), budget);
      await persistAssets(next);
      setAssets(next); setFileName(file.name); setNotice(`${next.length} assets validated and saved to ${organizationName}.`);
    }
    catch (e) { setAssets([]); setError(e instanceof Error ? e.message : "Unable to process this file."); }
    finally { setBusy(false); }
  };
  const rerun = () => {
    if (!assets.length) return;
    const current = assets.map(({ id, type, condition, age, criticality, failures, cost }) => ({ id, type, condition, age, criticality, failures, cost }));
    setAssets(rankAssets(current, budget));
  };
  const exportPlan = () => {
    const cell = (value: string | number | boolean) => {
      const text = String(value);
      return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = ["asset_id,type,condition,age_years,criticality,failures_24m,repair_cost,risk_score,priority_score,selected", ...assets.map((a) => [a.id,a.type,a.condition,a.age,a.criticality,a.failures,a.cost,a.risk.toFixed(1),a.priority.toFixed(1),a.selected].map(cell).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "civic-repair-priorities.csv"; link.click(); URL.revokeObjectURL(link.href);
  };

  if (!supabase) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">MSE CIVIC SYSTEMS</p><h1>Setup required</h1><p>Add the Supabase URL and publishable key to the local environment before continuing.</p></section></main>;
  if (!authReady) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">MSE CIVIC SYSTEMS</p><h1>Opening your workspace…</h1></section></main>;
  if (!session) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">MSE CIVIC SYSTEMS / PRIVATE WORKSPACE</p><h1>{authMode === "signin" ? "Plan with confidence." : "Create your workspace."}</h1><p>Maintain an organization-owned asset register and create transparent, budget-aware capital scenarios.</p><form onSubmit={submitAuth} className="auth-form"><label>Email<input type="email" required autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label><label>Password<input type="password" required minLength={8} autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? "Working…" : authMode === "signin" ? "Sign in" : "Create account"}</button></form>{authMessage && <p className="notice" role="status">{authMessage}</p>}<button className="text-button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? "New here? Create an account" : "Already registered? Sign in"}</button></section></main>;
  if (!organizationId && workspaceReady) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">FIRST, CREATE A WORKSPACE</p><h1>Give your asset team a home.</h1><p>Data is private to your workspace. Invite management is being added separately; no other account can see these records.</p><form onSubmit={createWorkspace} className="auth-form"><label>Organization or team name<input required minLength={2} maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="e.g. North District Works" /></label><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button></form>{notice && <p className="notice" role="alert">{notice}</p>}</section></main>;
  if (!workspaceReady || !organizationId) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">MSE CIVIC SYSTEMS</p><h1>Loading secure workspace…</h1></section></main>;

  return <main className="shell">
    <aside className="rail"><div className="brand"><span className="brand-mark">M</span><span>MSE / CIVIC SYSTEMS</span></div><nav><a className="active" href="#overview">Portfolio overview</a><a href="#asset-register">Asset register</a><a href="#risk-queue">Risk &amp; criticality</a><a href="#capital-plan">Capital plan</a><a href="#method">Method &amp; assumptions</a></nav><div className="rail-note">DECISION SUPPORT<br/><span>Organization-owned records with role-scoped access.</span></div></aside>
    <section className="content" id="overview"><header className="topline"><span>INFRASTRUCTURE INTELLIGENCE / {organizationName.toUpperCase()}</span><span className="account">{session.user.email}<button onClick={() => supabase?.auth.signOut()}>Sign out</button></span></header>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="hero"><div><p className="eyebrow">CAPITAL PLANNING / 01</p><h1>Repair the assets<br/>that matter most.</h1><p className="lead">Turn condition, failure history, criticality, and repair cost into a transparent, budget-aware intervention plan.</p></div><div className="hero-index">01 <span>/ 10</span></div></div>
      <section className="panel import-panel" id="asset-register"><div><p className="eyebrow">01 — LOAD YOUR REGISTER</p><h2>Start with your asset data</h2><p className="muted">CSV columns: <code>asset_id, type, condition_1_5, age_years, criticality_1_5, failures_24m, repair_cost</code></p></div><label className="upload">{busy ? "Saving…" : fileName ? `Replace ${fileName}` : "Choose asset CSV"}<input id="asset-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={handleFile}/></label></section>
      {error && <p className="error" role="alert">{error}</p>}
            <section className="control-row" id="capital-plan"><div><p className="eyebrow">02 — SET CAPITAL CONSTRAINT</p><label htmlFor="budget">Available repair budget</label></div><div className="budget"><span>$</span><input id="budget" type="number" min="0" value={budget} onChange={(e) => { const value = Number(e.target.value); budgetRef.current = value; setBudget(value); }} onBlur={rerun}/><button onClick={rerun}>Recalculate plan <b>↗</b></button></div></section>
      <section className="metrics"><article><span>ASSETS ASSESSED</span><strong>{assets.length || "—"}</strong><small>Validated register rows</small></article><article><span>RECOMMENDED REPAIRS</span><strong>{assets.length ? selected.length : "—"}</strong><small>Selected within budget</small></article><article><span>CAPITAL ALLOCATED</span><strong>{assets.length ? `$${totalCost.toLocaleString()}` : "—"}</strong><small>{assets.length ? `${((totalCost / Math.max(1, budget)) * 100).toFixed(0)}% of available budget` : "Awaiting asset data"}</small></article></section>
      <section className="panel table-panel" id="risk-queue"><div className="table-head"><div><p className="eyebrow">03 — DECISION QUEUE</p><h2>Intervention priorities</h2></div><div className="actions"><button className="secondary" onClick={savePlan} disabled={!assets.length || busy || assets.some((asset) => !assetDatabaseIds.has(asset.id))}>{busy ? "Saving…" : "Save budget plan"}</button><button className="secondary" onClick={exportPlan} disabled={!assets.length}>Export plan <b>↓</b></button></div></div>{assets.length ? <div className="table-wrap"><table><thead><tr><th>ASSET</th><th>TYPE</th><th>RISK</th><th>CRITICALITY</th><th>REPAIR COST</th><th>PLAN</th></tr></thead><tbody>{assets.map((a) => <tr key={a.id}><td><strong>{a.id}</strong><small>{a.failures} failures / 24 mo</small></td><td>{a.type}</td><td><span className={`risk ${a.risk > 65 ? "high" : a.risk > 35 ? "mid" : "low"}`}>{a.risk.toFixed(0)} / 100</span></td><td>{a.criticality} / 5</td><td>${a.cost.toLocaleString()}</td><td>{a.selected ? <span className="included">IN PLAN</span> : <span className="deferred">DEFERRED</span>}</td></tr>)}</tbody></table></div> : <div className="empty"><span>CSV</span><p>Your ranked repair queue will appear here once an asset register is loaded.</p><small>No example records are inserted; analysis only runs on data you provide.</small></div>}</section>
      <section className="method-note" id="method"><p className="eyebrow">SCORING / RISK SCREENING V1</p><p>Condition risk (40%), cohort-normalized age (25%), and cohort-normalized 24-month failures (35%) form a 0–100 exposure score. Criticality scales consequence. The budget queue is a greedy priority-per-cost heuristic, not a calibrated failure probability or globally optimal portfolio.</p></section>
      <footer><span>MSE CIVIC INFRASTRUCTURE / PRIVATE-BY-DESIGN</span><span>Risk score is a screening aid, not an engineering inspection.</span></footer>
    </section>
  </main>;
}
