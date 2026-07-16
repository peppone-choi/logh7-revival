# LOGH VII Portrait Evidence Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable pipeline that harvests public Archive.org reference images, records their provenance, and scores every reference image against VII portrait slots with multiple deterministic visual features.

**Architecture:** Keep harvesting and matching separate. `tools/logh7_reference_image_harvest.py` reads `content/roster/archive-org-logh-sources.json`, downloads bounded-size public image files into `.omo/work/`, and writes a manifest. `tools/logh7_portrait_ensemble_match.py` consumes a manifest plus `content/roster/portraits` or `.omo/work/portraits`, computes multiple feature scores, and writes ranked candidates with accept/candidate/reject status.

**Tech Stack:** Python 3.11+, standard library, Pillow, NumPy. No new runtime dependency in this slice; ML model backends are planned as optional adapters after the deterministic baseline is verified.

---

### Task 1: Reference Image Harvester

**Files:**
- Create: `tools/logh7_reference_image_harvest.py`
- Output: `.omo/work/logh7-reference-images/archive-reference-manifest.json`

- [ ] **Step 1: Implement a bounded Archive.org image harvester**

Create a CLI that:
- reads `content/roster/archive-org-logh-sources.json`
- selects candidate files with `usefulness == "image_reference_candidate"`
- enforces `--max-bytes` and `--limit`
- downloads to `.omo/work/logh7-reference-images/<identifier>/`
- writes JSON manifest entries with source URL, local path, hash, dimensions, source role, and confidence cap.

- [ ] **Step 2: Run a smoke harvest**

Run:

```bash
python3 tools/logh7_reference_image_harvest.py --limit 30 --max-bytes 30000000 --out .omo/work/logh7-reference-images/archive-reference-manifest.json
```

Expected: manifest exists and contains only downloaded or skipped entries with reasons.

### Task 2: Ensemble Matcher

**Files:**
- Create: `tools/logh7_portrait_ensemble_match.py`
- Output: `.omo/work/logh7-portrait-ensemble/archive-reference-rankings.json`

- [ ] **Step 1: Implement deterministic feature extraction**

Features:
- grayscale normalized cross correlation
- mirrored normalized cross correlation
- average hash Hamming similarity
- difference hash Hamming similarity
- color histogram intersection
- edge orientation histogram similarity
- coarse spatial color-grid similarity

- [ ] **Step 2: Implement scoring and status gates**

The matcher must compute `best`, `second`, and `gap` per reference. It emits:
- `accepted` only when score and gap pass thresholds
- `candidate` for useful but not decisive scores
- `rejected` when weak or ambiguous

- [ ] **Step 3: Add CLI**

Run shape:

```bash
python3 tools/logh7_portrait_ensemble_match.py --refs .omo/work/logh7-reference-images/archive-reference-manifest.json --portraits content/roster/portraits --out .omo/work/logh7-portrait-ensemble/archive-reference-rankings.json --topk 8
```

### Task 3: Tests

**Files:**
- Create: `tools/tests/test_logh7_portrait_ensemble_match.py`

- [ ] **Step 1: Test feature behavior using synthetic images**

Create small RGB images in temp dirs. Assert identical images rank above inverted or shifted images; mirrored NCC can match a mirror; ambiguous scores do not auto-accept.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
python3 -m unittest tools.tests.test_logh7_portrait_ensemble_match
```

Expected: pass.

### Task 4: Pipeline Run

**Files:**
- Output: `.omo/work/logh7-reference-images/archive-reference-manifest.json`
- Output: `.omo/work/logh7-portrait-ensemble/archive-reference-rankings.json`

- [ ] **Step 1: Harvest references**

Run the harvester with conservative limits to avoid huge scans in this first slice.

- [ ] **Step 2: Match against VII portraits**

Run the ensemble matcher against `content/roster/portraits`.

- [ ] **Step 3: Summarize counts**

Report manifest counts, matched reference counts, accepted/candidate/rejected counts, and the strongest matches. Do not claim identity unless accepted by gates and backed by labeled reference provenance.
