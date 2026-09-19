# robot-factory

A visual robot production simulator built by the Hermes Software Factory.

Order robots, manage the line (Fabricator → Assembler → Finisher), ride out
factory events, and keep the credits rolling in. Everything in `src/sim` is
pure and deterministic — randomness is injected, state is immutable, and the
UI is just a React wrapper around it.

## Getting started

```bash
npm install
npm run dev       # start Vite dev server
npm run build     # typecheck + production build
npm run preview   # preview the production build
```

## Quality gates

```bash
npm run test:run   # run the Vitest suite once
npm run lint       # ESLint
npm run build      # tsc -b && vite build
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the production
build on every push and pull request.

## Architecture

- `src/sim/` — the pure simulation core.
  - `factory.ts` — `tick()` (advance the clock) and every action
    (`addOrder`, `repair`, `upgrade`, `setOverclock`, `emergencyCool`,
    `salvage`, `buyOutEvent`, `setPaused`, …), all pure and RNG-injected.
  - `config.ts` — all tuning constants in one place (costs, speeds, events,
    heat, queue caps). The UI imports from here so it can never drift from the sim.
  - `economy.ts` — pricing, build times, reliability/heat failure risk.
  - `modifiers.ts` — event effects reduced to numeric factors.
  - `throughput.ts` — pacing helpers (ETA, rates, bottleneck detection).
  - `persist.ts` — save/load/migration with defensive normalization.
  - `__tests__/` — deterministic behaviour tests (no mocking of the core).
- `src/hooks/useFactory.ts` — the only impure part: a `requestAnimationFrame`
  loop feeding real time into `tick()`, plus debounced autosave and cue sounds.
- `src/components/` — presentational React components.
- `src/utils/audio.ts` — WebAudio cue blips.

## Game systems

- **Machine heat & overclock** — running machines build heat; overclocking adds
  +25% speed but doubles heat build-up. Hot machines fail more. `Emergency cool`
  vents a machine instantly (12 cr). A machine that overheats fully seizes into
  a breakdown.
- **Breakdowns & salvage** — a jam/component failure/power issue parks a machine
  with a WIP job. Repair it (discounted during a maintenance event), or
  `salvage` the stuck job for half its order cost to fund the repair.
- **Events** — power surges, bulk orders (bonus ~25% of the sale value shipped
  during the event), perfect assembly bonuses, repair discounts, and material
  shortages. Power surges and shortages can be **bought out** for 120 cr.
- **Keyboard shortcuts** — `1`/`2`/`3` game speed, `Space` pause, `?` help.
  Pause writes a pristine state, so the sim is fully inspectable/resumable.

## Data

Progress autosaves to `localStorage` (every 2 s and on tab close) under
`robot-factory-save-v1`.