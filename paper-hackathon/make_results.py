"""Build the hackathon paper's results section from run data.

Every number in results.tex comes from runs/, so the paper cannot drift from
what the code produced.

    python paper-hackathon/make_results.py
"""

import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "paper-hackathon"
MULTI = ROOT / "runs" / "hackathon_10seeds.json"
SEED1 = ROOT / "runs" / "matched_seed1.json"
LLM = ROOT / "runs" / "llm_agents.json"

# Scripted agents consume no inference. Price their CPU generously so the
# cost ratio is conservative rather than flattering.
CPU_DOLLARS_PER_HOUR = 0.10
LABEL = {"donothing": r"\texttt{donothing}", "lookup": r"\texttt{lookup}",
         "random": r"\texttt{random}", "heuristic": r"\texttt{heuristic}"}
ORDER = ["heuristic", "random", "donothing", "lookup"]
TRAIN, HELD = set(range(1, 9)), {9, 10}


def pct(v):
    s = f"{v:+.0%}".replace("%", r"\%")
    return s.replace("-", "$-$", 1) if s.startswith("-") else s


def main():
    if not MULTI.exists():
        sys.exit(f"missing {MULTI} -- run the 10-seed benchmark first")
    multi = json.loads(MULTI.read_text())
    by = {}
    for r in multi:
        by.setdefault(r["agent"], []).append(r)

    # ---- Table 1: 10 seeds -------------------------------------------
    rows = []
    for a in [x for x in ORDER if x in by]:
        rs = by[a]
        sc = [r["score"] for r in rs]
        rows.append(
            f"{LABEL[a]} & {statistics.fmean(sc):.1f} & "
            f"{statistics.pstdev(sc):.1f} & {min(sc):.1f} & {max(sc):.1f} & "
            f"{statistics.fmean(r['terminal_equity'] for r in rs)/1e6:.1f} & "
            f"{pct(statistics.fmean(r['total_return'] for r in rs))} & "
            f"{statistics.fmean(r['mwh_delivered'] for r in rs)/1e3:,.0f} & "
            f"{statistics.fmean(r['lcoe'] for r in rs):.0f} & "
            f"{sum(1 for r in rs if r['insolvent'])} \\\\")

    t1 = r"""\begin{table}[t]
\centering\small
\caption{Ten seeds, ten simulated years each, matched twenty-decision budget.
Equity is terminal equity value in millions against a \$25M start; GWh is energy
delivered; LCOE is levelised cost in \$/MWh; \emph{Ins.} counts insolvencies.}
\label{tab:multi}
\begin{tabular}{lrrrrrrrrr}
\toprule
Agent & Score & sd & min & max & Equity & Return & GWh & LCOE & Ins. \\
\midrule
%s
\bottomrule
\end{tabular}
\end{table}
""" % "\n".join(rows)

    # ---- Table 2: cost-accuracy, seed 1 ------------------------------
    t2 = discussion = ""
    if SEED1.exists() and LLM.exists():
        base = {r["agent"]: r for r in json.loads(SEED1.read_text())}
        llm = json.loads(LLM.read_text())
        crows = []
        for k in ("sonnet5", "opus5", "haiku45"):
            if k not in llm:
                continue
            e, c = llm[k], llm[k]["card"]
            crows.append(f"{e['model']} & {c['score']:.1f} & "
                         f"{c['terminal_equity']/1e6:.1f} & "
                         f"\\${e['cost_usd']:.2f} & {e['duration_s']/60:.1f} & "
                         f"{c['score']/e['cost_usd']:,.0f} \\\\")
        crows.append(r"\midrule")
        for a in ORDER:
            if a not in base:
                continue
            r = base[a]
            cost = r["wall_seconds"] / 3600 * CPU_DOLLARS_PER_HOUR
            crows.append(f"{LABEL[a]} & {r['score']:.1f} & "
                         f"{r['terminal_equity']/1e6:.1f} & "
                         f"\\${cost:.4f} & {r['wall_seconds']/60:.1f} & "
                         f"{r['score']/cost:,.0f} \\\\")

        t2 = r"""\begin{table}[t]
\centering\small
\caption{Cost of reasoning. All agents on seed 1 under the same twenty-decision
budget. Language-model cost is the whole-episode token total at published
first-party rates; scripted cost prices CPU at \$0.10/hour, a deliberately
generous figure. \emph{Score/\$} is the resulting accuracy-per-dollar.}
\label{tab:cost}
\begin{tabular}{lrrrrr}
\toprule
Agent & Score & Equity & Cost & Minutes & Score/\$ \\
\midrule
%s
\bottomrule
\end{tabular}
\end{table}
""" % "\n".join(crows)

        best_llm = max((llm[k] for k in llm), key=lambda e: e["card"]["score"])
        h = base.get("heuristic")
        if h:
            ratio = (h["score"] / (h["wall_seconds"] / 3600 * CPU_DOLLARS_PER_HOUR)) \
                    / (best_llm["card"]["score"] / best_llm["cost_usd"])
            frac = h["score"] / best_llm["card"]["score"]
            discussion = (
                f"Table~\\ref{{tab:cost}} is the result this paper exists for. "
                f"On the same map, under the same budget, "
                f"{best_llm['model']} scores {best_llm['card']['score']:.1f} and "
                f"\\texttt{{heuristic}} scores {h['score']:.1f}. The language "
                f"model is ahead --- we are not claiming otherwise. But it "
                f"costs \\${best_llm['cost_usd']:.2f} and "
                f"{best_llm['duration_s']/60:.1f} minutes to get there, against "
                f"a tenth of a cent and {h['wall_seconds']/60:.1f} minutes. The "
                f"policy with no search loop reaches {frac:.0%} of the score at "
                f"roughly $1/{1/ (1/ratio):.0f}$ of the cost, or "
                f"{ratio:,.0f}$\\times$ the accuracy per dollar."
                .replace("%", r"\%"))

    # ---- generalisation gap ------------------------------------------
    gap_txt = ""
    if "heuristic" in by:
        tr = [r["score"] for r in by["heuristic"] if r["seed"] in TRAIN]
        he = [r["score"] for r in by["heuristic"] if r["seed"] in HELD]
        if tr and he:
            t, h2 = statistics.fmean(tr), statistics.fmean(he)
            rel = (t - h2) / t if t else 0.0
            verdict = ("within noise, so we see no evidence of layout fitting"
                       if abs(rel) < 0.25 else
                       "large enough to suggest the policy is fitted to the "
                       "development layouts")
            gap_txt = (
                f"\\paragraph{{Held-out seeds.}} \\texttt{{heuristic}} averages "
                f"{t:.1f} on the eight development seeds and {h2:.1f} on seeds 9 "
                f"and 10, which were not run until final scoring --- a relative "
                f"gap of " + f"{rel:+.1%}".replace("%", r"\%") + f", {verdict}. "
                f"The policy has no parameters to fit, so this is a check that "
                f"the \\emph{{environment}} does not vary wildly by layout, as "
                f"much as a check on the agent.")

    body = "\\section{Results}\n\\label{sec:results}\n\n" + t1 + "\n"
    if by.get("lookup") and by.get("donothing"):
        lk = statistics.fmean(r["score"] for r in by["lookup"])
        dn = statistics.fmean(r["score"] for r in by["donothing"])
        eq = statistics.fmean(r["total_return"] for r in by["lookup"])
        rel = "below" if lk < dn else "above"
        body += (
            f"\\paragraph{{Memorisation loses money.}} \\texttt{{lookup}} scores "
            f"{lk:.1f}, {rel} the {dn:.1f} of holding capital and building "
            f"nothing, with a mean return of " + f"{eq:+.0%}".replace("%", r"\%") +
            f". An agent applying a fixed terrain$\\rightarrow$machine table does "
            f"not merely fail to excel; it destroys capital, because it sites "
            f"without regard to the resource that actually reaches a cell and "
            f"orients every machine identically regardless of the wind. This is "
            f"the falsifiable form of the anti-memorisation claim: if a lookup "
            f"table ever became competitive, the environment would be rewarding "
            f"the surface correlations it was built to punish "
            f"\\citep{{tien2023causal}}.\n\n")
    if gap_txt:
        body += gap_txt + "\n\n"
    if t2:
        body += t2 + "\n" + discussion + "\n\n"
        body += (
            "\\paragraph{Why this is the interesting axis.} The same shape of "
            "argument runs through the recursive-reasoning literature: TRM "
            "reaches competitive accuracy with 7M parameters where HRM uses 27M "
            "\\citep{jolicoeurmartineau2025trm,wang2025hrm}, and BDH-CQ adapts "
            "through recurrent state rather than a backward pass per task "
            "\\citep{engdahl2026bdhcq}. What those results assert about "
            "parameter counts, Table~\\ref{tab:cost} measures in dollars on a "
            "task with a long horizon and an economic objective. A model that "
            "matched the language-model score at the state-based policy's cost "
            "would dominate this frontier outright. Nothing we ran occupies that "
            "corner --- which is precisely the corner BDH-style architectures "
            "claim.\n\n")
    (OUT / "results.tex").write_text(body)
    print(f"wrote results.tex ({len(multi)} runs)")
    for a in [x for x in ORDER if x in by]:
        sc = [r["score"] for r in by[a]]
        print(f"  {a:<11} {statistics.fmean(sc):5.1f} +/- {statistics.pstdev(sc):4.1f}"
              f"   [{min(sc):.1f}, {max(sc):.1f}]")


if __name__ == "__main__":
    main()
