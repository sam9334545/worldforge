# Hackathon paper

Argues one measured point: on this benchmark, a state-based policy with no
search loop, no backtracking and no weight updates reaches most of the best
language model's score at a tiny fraction of its cost — and that the corner of
the frontier BDH-style architectures claim (high score, low cost) is now
measurable but unoccupied.

**We did not run a BDH model.** This is the harness, the protocol and the
measurement. The paper says so in the abstract and again in the limitations;
do not let it be read as an architecture comparison.

## Build

```bash
# 1. Produce the numbers (about 30 minutes, no inference cost)
wfbench bench --agents donothing,lookup,random,heuristic \
  --seeds 1-10 --years 10 --interval 4320 --out runs/hackathon_10seeds.json

# 2. Generate the results section from that data
python3 paper-hackathon/make_results.py

# 3. Compile
cd paper-hackathon && mkdir -p build && tectonic -X compile main.tex --outdir build
```

`make_results.py` reads `runs/hackathon_10seeds.json`, `runs/matched_seed1.json`
and `runs/llm_agents.json` and writes `results.tex`. Every figure in the paper
comes from those files, so re-running the benchmark updates the paper.

## Before submitting

- **Verify the citations.** `references.bib` was written from supplied details.
  Two entries could not be checked against arXiv at the time of writing —
  `arXiv:2608.09888` (BDH-CQ) and `arXiv:2506.21734` (HRM). Confirm the IDs,
  authors and titles.
- **Fill in the author block** in `main.tex`; it currently reads "Hackathon
  submission".
- The language-model rows come from three single-seed episodes on an engine
  version since corrected for a defect those episodes exposed. The paper labels
  them provisional. Re-run them on the current engine if there is time.
- `hackathon_style.sty` is a local reimplementation of a conference layout for
  offline drafting. Replace it if the venue supplies its own.
