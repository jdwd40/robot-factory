# Robot Factory — Code Review & Fun-Improvement Suggestions

Reviewed at commit `54fc0a1` (plus the working-tree changeset: the game is effectively "v0.2"). All 80 tests pass; `npm run lint` is clean.

---

## 1. Architecture — strengths

The structure is genuinely good and worth preserving:

- **Clean simulation core.** `src/sim/` is pure, deterministic, and RNG-injected (`random.ts`). `tick()` is a pure function over `FactoryState` (`factory.ts:392`) and everything (breakdowns, events, EMAs) is replayable. The determinism tests (`determinism.test.ts`) prove this end-to-end.
- **Impure logic quarantined.** `useFactory.ts` is the only place that touches `requestAnimationFrame`, `Math.random`, `localStorage`, and WebAudio. That separation is the best thing in the codebase.
- **Defensive persistence.** `persist.ts` normalizes every field, drops invalid records, clamps hostile numbers, and falls back to a fresh factory. Tested with garbage input (`persistence.test.ts:59-95`).
- **Strong test suite.** 80 tests covering economy, machines, bottleneck detection, events, breakdowns, migration, determinism, and money conservation (`integrity.test.ts` verifies credits/profit identities across a 20-minute autoplay run).
- **Good a11y fundamentals.** `aria-live` on the payout/log, `aria-pressed` on toggles, `role="progressbar"` on heat, focus management in modals, `prefers-reduced-motion` support.

---

## 2. Findings (bugs / correctness)

### 2.1 — Bottleneck detection ignores the player's order queue (real inaccuracy)
`detectBottleneck` measures `inputQueue = m.inputBuffer.length + (currentJob ? 1 : 0)` (`throughput.ts:74`), but for the Fabricator the backlog lives in `state.orders`, not `inputBuffer`. So a player with 50 robots queued will see *"Fabricator · 1 queued"*. The Fabricator's true backlog should be `state.orders.length`.

### 2.2 — No soft-lock protection (gameplay bug)
If all three machines break down at once and `credits < cheapest repair` (20 cr), the game is stuck: you can't repair, can't order (orders cost a worker 30 cr upfront), and nothing ships. Suggestion: an "emergency loan" (repay with interest from future sales), a "salvage the WIP robot for a fraction of its build cost" option, or an automatic slow self-repair after a long timeout. At minimum, document/flag the failure mode.

### 2.3 — Unbounded order queue vs. per-frame `structuredClone`
`tick()` clones the whole state every frame via `structuredClone` (`factory.ts:395`), and the order queue is unbounded. A long session (or an autoclicker placing a few thousand orders) makes every frame's clone and `orders.shift()` more expensive — a descending-perf spiral. Add a hard queue cap or switch to lighter structural sharing/immutable updates before relying on perf.

### 2.4 — Heat is a passive gauge, not a mechanic
There is no active cooling action, and cooldown only happens when a machine is *not* processing (`factory.ts:314-316`) — which in a saturated line never happens. So heat inexorably climbs to 1.2× and just sits there as a permanent failure-rate tax. Nobody "manages heat". See §3 for ways to make this a real decision.

### 2.5 — Magic numbers duplicated across layers
- Maintenance discount `0.7` appears in `factory.ts:479,500` **and** `MachineCard.tsx:163` (and tests). Change it in one place and the UI lies.
- Material-shortage factor `1.6` lives in both `factory.ts:152` and `throughput.ts:21` (as `1/1.6`).
- Heat thresholds (`0.9` hot, `0.55` warm, `0.85` threat) are hard-coded in `MachineCard.tsx:26-30,142` *and* mirrored in CSS classes — a tuning pass touches two files.
These belong in `config.ts` next to the rest of the tuning knobs.

### 2.6 — Event effects are scattered
`activeModifiers` returns only booleans (`modifiers.ts`); the *magnitude* of each effect (×0.5 surge, 1.6 shortage, 1.5 assembly bonus, 0.7 discount) is hard-coded at the call sites. A declarative `EVENT_CONFIG` "effect" table (or a `modifierAmounts()` alongside the booleans) would centralize tuning and keep the sim readable.

### 2.7 — Report "avg sale value" is inflated
`avgSale = s.revenue / s.buildSamples` (`ReportModal.tsx:27`) — but `revenue` includes bulk-order **bonuses**, which aren't sales. For a 6-robot bulk order fulfilled that's +180 cr of fake "sale". Compute avg sale from `byTypeRevenue` sums instead.

### 2.8 — Fabricator shows "1 queued" until it stops; wall-clock display is sim-time
Two minor UI notes:
- `formatClock` (`format.ts:13`) renders `startedAtWall + elapsed*1000`. At 3× speed the "clock" races ahead of real time, which reads as a bug to players who expect a wall clock.
- `meanStageTime` for an empty machine invents an average across all models (`throughput.ts:31-35`) — harmless display heuristic, but it feeds `machineRate`/`avgWait` in the stats footer, so it can show plausible-looking numbers for an idle line.

### 2.9 — Minor React/accessibility nits
- **Log spam:** `EventLog` re-renders the whole `<ol aria-live="polite">` every frame; an `aria-live` region that changes 60×/sec can be chatty for screen readers. Better: announce only *new* entries.
- **Animation-re trigger via `key`:** `Header.tsx:27` keys the credits `<dd>` on `Math.round(state.credits)`, remounting the node on every change to restart `stat-pop`. It works but defeats DOM reuse for a minuscule gain; a CSS class toggle or `flip` component would be cleaner.
- **`dl` markup:** `catalog-stats` wraps `dt`/`dd` in `<div>` (`OrdersPanel.tsx:109-125`) — not valid HTML structure for `dl`. Minor, but easy to fix.
- **Order cue suppression:** in `useFactory.ts:89` an order placed in the same frame as a shipment suppresses its sound cue (rare, not worth much).

> No crash-level bugs were found; the above are design-level inaccuracies and robustness gaps.

---

## 3. How to make it more fun

The loop today is *order → watch → ship → upgrade → repeat*, and its only friction is random breakdowns/events. It's pleasant but shallow after ~20 minutes. These are the highest-leverage ideas, roughly ordered by ROI:

### 3.1 Give heat an actual decision (biggest cheap win)
Make "run hot" a *choice*, not a tax:
- Add an **overclock/boost toggle** per machine: +X% speed, but heat climbs faster and the breakdown rate rises with heat (already wired in). Players then trade speed for reliability and must actively *throttle* or *idle to cool*.
- Add an active **"emergency cool"** (one-shot spend that vents heat) or a **Cooling** upgrade track so investing in heat management is visible.
- Show a breakdown *probability* ("3.2% / unit") next to the heat gauge so the trade-off is legible.

### 3.2 Rebalance events so negative ones are escapable / positive ones have teeth
- Bulk-order payouts scale with robot tier (30 cr for a 55-cr worker is OK; 30 cr for a 205-cr combat bot is cheap). Make bonus proportional to the mix shipped, and consider *declining* a bulk order.
- Add **"buy-out / countermeasure"** options on negative events (pay credits to end a power surge or material shortage early) — a moment-to-moment resource decision instead of "wait out the debuff".
- Consider *choice* events (choose 1 of 3 random modifiers) — cheap to add, disproportionately exciting, fits the command-room fantasy.

### 3.3 Add a real market / selling decision
Right now sale timing is automatic and prices are fixed. A simple oscillating price-per-model (or per-material) means players decide *what to build now* and can hold stock in a warehouse to sell into a price spike — a classic tycoon decision that slots into the existing data model (a `warehouse` of shipped-but-not-sold units, `salePrice = base × demand(sin(t))`).

### 3.4 Give shipped robots a purpose — progression with meaning
Production sims get a huge fun boost when output *does* something:
- **Deploy robots to contracts/missions** (recon, security, construction) that pay over time or unlock new tech — consuming your best units but creating an active choice (cash now vs. unlock later).
- **Research tree / prestige:** a "renew factory with a prototype" prestige reset granting permanent patron bonuses; or a simple tech tree (next-tier materials, bay expansion, new models) to give the third upgrade track a revealed endgame.

### 3.5 Goals, milestones & achievements
The sim already tracks everything needed (by-model counts, profits, breakdowns, uptime, eventsFulfilled). Glue on:
- **Milestone targets** ("Hit 50 robots/hr", "Survive a jam with zero breakdowns") that award credits — early game gets an explicit next thing to do.
- **Achievements** as collectibles tied to those already-computed counters. Nearly free to add, gives the stats depth and repeatability.

### 3.6 Difficulty curve & fail-forward
The early game is very gentle (200 cr, one worker ≈ 1 robot/min). Consider:
- A **tutorial path** that nudges the first few interactions (highlight "Order a Worker"), since the schema/gates aren't obvious.
- **Rising market expectations** over time (longer runs require faster robots or better materials to stay profitable) so the mid/late game has pressure rather than pure on-ramp.
- When the line is starved (all machines idle with empty queue >30s), pop a subtle hint ("Line idle — queue some orders").

### 3.7 QoL that compounds
- **Pause button** (currently only 1×–3× speeds) — an idle-sim without pause is surprising.
- **Keyboard shortcuts:** `1/2/3` speed, `space` pause, `r` repair, `o` order, `esc` close modals.
- **Throughput charts** (a small sparkline of profit/hr or robots/hr) — the EMA number (Section 2.7/2.8) becomes much more legible as a line.
- **Filter the event log** (only warnings, or only economy) and auto-scroll to newest — at 3× it gets noisy.
- **Show next-unlock hints** on upgrade buttons ("Explorer unlocks at L2") — the gate information currently only lives in the order panel.
- Button tooltips with concrete current→next effect numbers (e.g., "Speed 7s → 4.7s"), so upgrades are legible decisions.

---

## 4. Maintenance & hygiene

- **Write an actual README** (`README.md` is two lines). Add the run/test commands (`npm run dev`, `npm test -- --run`, `npm run lint`, `npm run build`) and a short "how to play".
- **Commit hygiene:** `git status` shows a large, uncommitted changeset (many `??` files, one deleted test, `package-lock` modified). Land it as reviewed commits; the history (`feat`/`fix`/merge) is otherwise clean.
- Consider a **CI workflow** (e.g., GitHub Actions: install → `vitest run` → `eslint .` → `tsc -b`). The repo is disciplined enough that the pipeline cost is nearly zero.
- `gitignore` already covers `dist/` and `*.tsbuildinfo` — good, nothing else needed there.

---

## 5. Suggested priority order (if you act on this)

1. **2.1 / 2.2 / 2.5** — fix bottleneck counts, soft-lock escape hatch, centralize magic numbers. Small, safe, tested.
2. **3.1 Heat decision** + **3.2 event countermeasures** — the two changes that most increase moment-to-moment engagement with the existing systems.
3. **3.3 market/warehouse** or **3.4 robot deployment** — the next real content pillar; both fit the existing state model.
4. **3.5 milestones/achievements** + **3.7 QoL** — breadth that makes the whole game feel bigger.
5. Everything in §4 — hygiene, cheapest wins.