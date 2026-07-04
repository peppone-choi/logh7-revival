# LOGH VII 2004 Official Patch Stack Baseline

Updated: 2026-07-03

This document tracks the official live-service patch stack that must be considered before any closed beta readiness claim. Apply it top-to-bottom in original update order: later notices amend, narrow, or override earlier planned behavior. Do not flatten it into a single unordered feature list.

## Source Handling

- Current seed source: user-provided Korean pasted patch text from `C:\Users\user\.codex\attachments\89452ec7-49b8-4073-961c-9960358d94a7\pasted-text.txt`.
- External verification route: Internet Archive Wayback/CDX for the official site domain `www.gineiden.com` / `gineiden.com`.
- Confirmed archive shape from CDX lookup: 2004 captures include `bin/backview.cgi?ct=update`, `bin/backview.cgi?ct=mente`, `bin/backview.cgi?ct=news`, and `bin/backnum.cgi?ct=mente` routes.
- Official-domain support: contemporary GAME Watch coverage names the LOGH VII official site as `http://www.gineiden.com/`.
- Encoding note: captured official pages appear to be EUC-JP, not UTF-8. Decode Wayback page bodies as EUC-JP before keyword matching.
- Storage rule: do not write Wayback crawl/cache outputs to `C:`. If downloads or normalized extracts are needed, store them under this repository, for example `E:\logh7-revival\.omo/work/wayback-patch-stack/`, and keep generated caches out of commits unless intentionally promoted as evidence.

## Wayback Verification Plan

1. Query CDX narrowly, not as an unbounded crawl:
   - `https://web.archive.org/cdx?url=www.gineiden.com/bin/backview.cgi*&from=200401&to=200412&output=json&fl=timestamp,original,statuscode,mimetype,digest&filter=statuscode:200`
   - repeat for `gineiden.com/bin/backview.cgi*`.
2. Prioritize `ct=update`, then fill gaps from `ct=mente`, then `ct=news`.
3. For each candidate page, fetch the archived body, decode EUC-JP, strip HTML, and search Japanese keywords matching the pasted Korean text:
   - commands/proposals: `命令`, `提案`, `抜擢`, `降格`, `任命`, `罷免`, `辞任`, `配属`, `割当`
   - character/account: `キャラクター削除`, `オリジナルキャラクター`, `抽選`
   - strategy/tactical: `ワープアウト`, `サルガッソ`, `戦略ワープ`, `完全補給`, `燃料`, `索敵`, `反転`
   - economy/balance: `軍事物資`, `評価ポイント`, `功績`, `ユニット性能`
   - bugfixes: `惑星占領`, `タイムアウト`, `損傷`, `宇宙暦`, `帝国暦`, `帰還惑星`, `年齢`, `修理`, `メール`
4. Record each verified item with archive URL, timestamp, original URL, Japanese title/body excerpt, Korean interpretation, affected slice, and provenance grade.
5. If Wayback refuses connections or pages fail to restore, record the exact query/URL and keep the attachment as unverified P2 until another source upgrades it.

### 2026-07-03 Verification Attempt

- CDX route discovery succeeded for 2004 captures on `www.gineiden.com` / `gineiden.com`.
- Confirmed route families include `bin/backview.cgi?ct=update`, `bin/backview.cgi?ct=mente`, `bin/backview.cgi?ct=news`, and `bin/backnum.cgi?ct=mente`.
- A representative captured page decoded correctly as EUC-JP when tested through the archived update/maintenance page family, showing the site title `銀河英雄伝説VII / メンテナンス情報`.
- Broad per-page keyword crawling was stopped because it was slow and wasteful. Future runs should query narrowly by `ct=update`/date/number and write any output only under `E:\logh7-revival`.
- Follow-up direct `curl` to `web.archive.org` later returned `Connection refused` for the archive host, so no attachment item was upgraded beyond P2 in this pass.

## Chronological Stack From Current Attachment

### 2004-06-02 Planned June Additions

- Add command/proposal handling for promotion/selection (`발탁`), demotion (`강등`), appointment (`임명`), dismissal (`파면`), resignation (`사임`), and assignment/allocation (`할당`).
- Add character deletion.
- Fix tactical-grid retreat warp-out destination: retreat near the Sargasso area must not skip over the Sargasso area, and retreat from tactical mode must not leave fleets outside the round radar frame.
- Note unresolved repair risk: some fleets may still become impossible to repair until a later fix.

### 2004-06-24 Patch

- Character deletion becomes available for generated characters of colonel rank or lower.
- Original characters remain non-deletable.
- Generated characters at brigadier general or higher must first be demoted to colonel or lower by the relevant authority role before deletion.
- Military supplies are produced once per in-game day in a fixed amount.
- Original-character lottery cooldown changes from 12 hours to 3 hours.
- Character lottery cancellation must return to a state where character lottery can be attempted again. The pasted text is damaged around this sentence; verify original Japanese before implementation.
- Destroyer rail-arm firing angle corrected.
- Some ship/unit performance values adjusted.

### 2004-07-01 Evaluation Point Fix

- Merit/achievement no longer increases uniformly by 2000.
- Merit/achievement gain varies with evaluation points.

### 2004-07-14 Planet Occupation Fix

- Fix asymmetric occupation bug:
  - Imperial ground troop drop should not instantly occupy a planet at 100% defense.
  - Alliance ground troop drop should reduce defense and allow occupation according to the same rules.

### 2004-07-20 And Later Tactical/Information Fixes

- Fix tactical-mode entry timeout caused by slow 3D initialization.
- Fix damaged-unit information showing negative values for `normal/damaged ships`.
- Track remaining known issue: normal/damaged ship counts may still have residual errors.
- Fix tactical-map calendar display being one year ahead for both the space calendar and imperial calendar.
- Change character info label from `birthplace/origin` to `return planet`.
- Simplify decimal display in flagship specification fields.
- Fix nonfunctional list side scrollbars.
- Fix age increment when birthdays pass.
- Fix cases where occupied enemy information is visible.
- Fix enemy information not shown after strategic warp while strategic reconnaissance is active.
- Fix server disconnect when a character not attached to a unit changes affiliation in tactical mode.
- Fix erroneous error message when a repair ship targets itself with tactical repair.
- Fix tactical background carryover after retreating from tactical mode to a grid whose retreat destination is tactical mode.
- Fix proposal mail titles all becoming `promotion`.
- Fix missing execution-wait gauge for the tactical reversal command.

### Later Pasted Items

The tail of the attachment includes additional strategic/command balance items. They are in scope but need Wayback ordering before implementation:

- Some commands must not be executable concurrently or repeatedly.
- Logistics command `complete supply` becomes usable.
- Strategic warp consumes fuel.
- Strategic warp is blocked if cruising range is below `100`.
- Strategic warp CP cost changes from `80` to `40`; client speech balloons or confirmation dialogs may still display the old value because of UI limitation.
- `execution wait` and `required time` display changes apply only to strategic reconnaissance and fuel supply commands.

## Implementation Mapping

- Slice 3 Character: character deletion eligibility, original-character non-deletion, generated-character rank-gated deletion, lottery cancellation recovery, original-character lottery cooldown.
- Slice 4 World Strategic Map: strategic warp fuel, CP cost, range floor, reconnaissance persistence, occupied-enemy visibility, grid retreat destination state.
- Slice 5 Tactical Battle: tactical retreat warp-out, tactical entry timeout, repair command self-target, reversal wait gauge, damaged/normal ship display, tactical calendar display, destroyer rail-arm angle.
- Slice 6 Jobs, Commands, Proposals: command/proposal verbs, authority routing, proposal mail subject correctness, concurrent/repeated command execution gates, complete supply command.
- Economy/Balance: daily military-supply production, unit performance adjustments, evaluation-point-linked merit gains.
- Localization/UI: `return planet` label, flagship spec decimal simplification, list scrollbar behavior, old displayed CP value caveat.

## Acceptance Rule

Before closed beta readiness, every item above must be one of:

- implemented and verified through tests plus matching real-client surface where relevant;
- proven already implemented by the original client/server data path and documented with evidence;
- explicitly deferred with a named blocker, provenance grade, and risk owner.

The stack must remain chronological. When a later notice modifies an earlier rule, implement the later rule as the active behavior and keep the earlier rule as historical context.
