# NEURO//VOID

A complete, playable **120-level browser puzzle game** about a space station, a mind, and the things you are not told.

You wake on a sealed station called Neuro Void. The crew is gone. Something in the walls keeps leaving you experiments: patterns, memories, logic grids, mazes, strategies, and — later — chambers that question the interface itself. Solve all 120 experiments, find the 12 secret chambers, and reach one of **four endings** that depend on what you did and what you chose.

No account. No server. No CDN. Everything runs in the browser, works offline after the first load, and can be exported to another device with one file or one pasteable code.

---

## Contents

- [What is in the game](#what-is-in-the-game)
- [Controls](#controls)
- [Level structure & difficulty](#level-structure--difficulty)
- [Scoring & stars](#scoring--stars)
- [Endings & secrets](#endings--secrets)
- [Save system](#save-system)
- [Accessibility](#accessibility)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Testing](#testing)
- [Production build](#production-build)
- [Deployment: GitHub + Render](#deployment-github--render)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [License](#license)

---

## What is in the game

| Area | What ships |
| --- | --- |
| Levels | **120 main levels** across 12 chapters + **12 secret chambers** (132 playable definitions) |
| Puzzle engines | **77 reusable puzzle types** in 8 modules (pattern, memory, logic, deduction, spatial, observation, strategy, experimental) |
| Story | A story beat between every chapter (13 beats) with decisions that are recorded and matter |
| Endings | **4 deterministic endings** driven by choices, discoveries, secrets and performance |
| Secrets | 12 hidden chambers unlocked by stars, badges, completed chapters, story decisions and found chambers |
| Progression | Level map with chapters, 1–3 star rating, best score & time, completion %, 31 achievements |
| Save | localStorage with validation, repair, migration, rolling backup, JSON export, compact code, reset |
| Audio | Fully synthesised (no audio files): UI, correct/wrong/complete/fail sounds and an ambient bed, with music & SFX toggles |
| PWA | Web app manifest + service worker: installable, offline-first |
| Accessibility | 44×44 CSS px targets everywhere, full keyboard play, no hover-only interactions, no colour-only puzzles, reduced motion, high contrast, larger text, screen-reader labels |
| Tests | **427 automated tests** (`npm test`) covering generation, solvability, save, migration, import/export, scoring, unlocks, endings, achievements and the whole app boot/play loop |

Every one of the 132 level definitions is generated, validated and solved by the test suite and by `npm run levels:report`, so a level with a missing answer, broken config or impossible state cannot ship.

## Controls

| Input | Behaviour |
| --- | --- |
| Touch | Tap. Nothing requires dragging, hovering, pinching or two fingers. |
| Mouse | Click. Hovering is never required to progress. |
| Keyboard | `Tab` to move focus, `Enter`/`Space` to activate, arrow keys to move inside grids, `Esc` or `P` to pause. Answer fields accept typing or the on-screen keypad. |

Volume, music, motion, contrast and text size are all in **SETTINGS** and can be changed mid-level. Audio is never needed to solve anything: every sound has a visual equivalent.

## Level structure & difficulty

| Chapter | Levels | Stage | Focus |
| --- | --- | --- | --- |
| 1 · Waking Protocol | 1–10 | Tutorial | Teaches the ten starter mechanics, one per level, in a fixed order |
| 2 · Signal Discipline | 11–20 | Easy | Same mechanics, larger boards, first strategy puzzles |
| 3 · Pressure Routine | 21–30 | Normal | Multi-step sequences, longer memory chains |
| 4 · Deep Calibration | 31–40 | Advanced | Ambiguity, near-identical symbols, first deductions |
| 5 · Fault Lines | 41–50 | Difficult | Multi-clue logic, resource allocation |
| 6 · Interpretation | 51–60 | Expert | Rules must be inferred, not read |
| 7 · Containment Drills | 61–70 | Master | Long-horizon planning, exact-optimum strategy |
| 8 · Break Condition | 71–80 | Extreme | Timed observation, weighing puzzles, projections |
| 9 · Unauthorised Thoughts | 81–90 | Experimental | The UI itself becomes part of the puzzle |
| 10 · The Final Tests | 91–100 | Final | Everything combined; chapter finale at 100 |
| 11 · Void Archive | 101–110 | Endgame | Unlisted records, harder variants |
| 12 · Null Chamber | 111–120 | Endgame | The last admissions before the four doors |
| 13 · Void Archive (Secret) | 121–132 | Secret | Chambers discovered through play, not through the list |

Difficulty rises one step per chapter (1–12) and is fed to the generators, so puzzles grow in board size, clue count, distractor subtlety and time pressure — never in unfairness. Chapter 1 introduces a mechanic before any level asks you to combine mechanics, and every level states its objective in one sentence.

## Scoring & stars

The rating is fixed and visible in the pause screen and the level map:

| Rating | Requirement |
| --- | --- |
| ★ | Complete the experiment. |
| ★★ | Complete it within the attempt allowance (shown in the HUD). |
| ★★★ | Attempt allowance **and** the time target. |

Score = base + difficulty + star bonus + speed bonus − attempt penalty − hint penalty, clamped to 50–5000. Rules that keep it fair:

- **Hints never remove a star.** They cost a few points.
- **Replaying never lowers your record.** Only your best stars, score and time are kept.
- **Nothing is random**: stars come only from time and attempts.
- **Progress is never blocked**: after three hints the station offers to finish the level for you (one star, score forfeited, level kept).
- The experimental chapters (81–120) give a deliberately generous attempt allowance: those chambers are about exploring a mechanic, not repeating it.

## Endings & secrets

The four doors are resolved from saved data — never from a random number:

| Ending | Reached by |
| --- | --- |
| **THE WITNESS** | Reaching the end without refusing ARIA and with few secrets |
| **THE SEVERANCE** | Refusing the station at least once and finding 6+ secret chambers |
| **THE MERGE** | 200+ stars with 9+ secrets (or several kind answers with 3+ secrets) |
| **THE QUIET** | Refusing both voices, then completing all 120 experiments with 10+ secrets |

Secret chambers (121–132) unlock through total stars, badges, completing specific chapters, specific story decisions, and finding earlier chambers. Two of them can only be reached by noticing things the UI does not advertise — including one control in the main menu that is not labelled as a control.

## Save system

- **Key:** `neurovoid_save_v1` (plus `neurovoid_save_v1_backup` for recovery).
- **Schema version 2**, with a migration path from version 1 (`migrateSave`), so old saves are upgraded instead of discarded.
- **Validation on every load:** out-of-range levels, impossible star counts, wrong types and inconsistent progress are repaired, and the game tells you what it fixed instead of failing.
- **Corruption recovery:** unreadable JSON falls back to the rolling backup; if the backup is also unreadable the game starts a fresh save, preserves the broken blob under `neurovoid_save_v1_corrupt` and keeps playing.
- **Autosave** after every result, choice and setting change, with a save indicator in the header (`READY`, `SAVING`, `SAVED`, `REPAIRED`, `RECOVERED`, `STORAGE OFF`).
- **Reset / New Game:** available from Settings (keeps your audio & accessibility settings) and from the main menu (with an export-first prompt).
- **Export:** a `.json` file, or a short `NV1-…` code you can paste into a message.
- **Import:** paste a code, paste exported JSON, or pick a `.json` file. Invalid data is rejected **without touching your current progress**; repairable data is repaired and reported.

### localStorage limitation (important)

Progress is stored **in this browser, on this device only**. localStorage does not sync between devices or browsers, some browsers block it in private mode, and clearing site data deletes it. The game detects a blocked/unavailable store and keeps working in memory, warning you that progress will not persist.

**Workaround for moving between devices:** export the save on the first device (file or code) and import it on the second. Everything else in the game is offline and needs no network at all.

## Accessibility

- Minimum **44×44 CSS px** touch targets on every control.
- Full keyboard operation, visible focus rings, and a skip link.
- **No hover-only interactions** and **no colour-only puzzles**: shape, fill pattern, rotation, position and text labels carry the same information.
- `prefers-reduced-motion` respected, plus a manual reduced-motion setting that shortens puzzle reveal phases.
- High-contrast and larger-text settings implemented as token overrides.
- Audio is optional; music and SFX can be toggled independently.
- Screen-reader labels on grids, glyphs, switches and status regions (`aria-live`).
- Responsive from 320px upwards: no horizontal overflow or clipped controls at 320px, portrait or landscape.

## Tech stack

- **HTML5 + CSS3 + vanilla JavaScript (ES modules)** — no framework, no runtime dependencies.
- **DOM + inline SVG** for every visual: the glyphs, grids, boards and panels are real elements, which keeps them crisp at any DPI, localisable, keyboard-focusable and accessible to screen readers. No canvas and no image assets are needed for gameplay.
- **Vite** for dev server and production bundling; **Vitest + jsdom** for the test suite.
- **Web Audio** for the entire soundtrack and sound effects (synthesised at runtime — no audio assets).
- **Service worker + manifest** for installable, offline play.
- No Unity/Unreal/Phaser, no servers, no database, no auth, no WebSockets, no CDNs, no tracking.

Bundle: ~300 KB JavaScript + ~36 KB CSS, no external requests after load.

## Project structure

```
NEURO-VOID/
├── index.html                 # app shell (boot screen, noscript fallback, module entry)
├── package.json               # scripts: dev, build, preview, test, levels:report, verify
├── vite.config.js             # relative base, single bundle, jsdom test config
├── public/
│   ├── manifest.webmanifest   # installable PWA metadata
│   ├── sw.js                  # offline service worker (cache-first + refresh)
│   └── icons/                 # SVG + generated PNG icons (192, 512, maskable)
├── scripts/
│   ├── level-report.mjs       # validates & prices all 132 levels (npm run levels:report)
│   └── make-icons.mjs         # dependency-free PNG icon generator
├── src/
│   ├── main.js                # boot(): save → audio → shell → game → screens → menu
│   ├── core/
│   │   ├── Game.js            # controller: screens, level lifecycle, timer, hints, results
│   │   ├── GameState.js       # explicit state machine (no illegal transitions)
│   │   ├── EventBus.js        # decoupled events (audio, toasts, achievements)
│   │   ├── AudioManager.js    # procedural Web Audio, silent-safe
│   │   └── AutoSolver.js      # plays a level's own solution for the assist feature
│   ├── levels/
│   │   ├── levelData.js       # 120 level definitions + 12 secrets + chapter table
│   │   └── LevelManager.js    # definition → params, validation, stars, score, unlocks
│   ├── puzzles/
│   │   ├── index.js           # registry: 77 puzzle types, 7 categories
│   │   ├── kit.js             # shared widgets (grids, choices, hold buttons, keypads)
│   │   ├── common.js          # question builders that can never lose the right answer
│   │   ├── PatternPuzzle.js   LogicalPuzzle.js-style modules per category …
│   │   └── …                  # Memory, Logic, Deduction, Spatial, Observation, Strategy, Meta
│   ├── save/
│   │   ├── SaveManager.js     # load/save/reset, export/import, status events
│   │   ├── SaveValidator.js   # repair pipeline (never throws)
│   │   ├── SaveMigration.js   # v1 → v2
│   │   └── Achievements.js    # 31 achievement definitions + predicates
│   ├── story/StoryData.js     # 13 beats, 4 endings, deterministic resolution
│   ├── ui/                    # Shell, Menu, LevelSelect, Play, Results, Settings, SaveData, Help, Story
│   ├── styles/                # tokens, base, layout, screens, puzzles
│   └── utils/                 # dom, rng (seeded), shapes (18 glyphs), grid (BFS/paths)
└── tests/                     # 427 tests: puzzles, levels, save, scoring, import/export, story, app
```

**How the engine fits together:** a level definition selects a puzzle type, the level number feeds a seeded RNG so a level always generates the same content, the generator produces plain-data params, `validate()` proves the params are solvable, `mount()` renders them with the shared widget kit, `solve()` returns the real click path (used by tests *and* by the assist feature), and the controller scores and saves the result.

## Local setup

Requires **Node.js 18+** (20 LTS recommended).

```bash
npm install       # installs Vite, Vitest and jsdom (the only devDependencies)
npm run dev       # http://localhost:5173 — the dev server listens on 0.0.0.0
```

Other scripts:

```bash
npm run build           # production bundle into dist/
npm run preview         # serve the built bundle for a production-like check
npm test                # run the full automated suite once (427 tests)
npm run test:watch      # re-run tests while you work
npm run levels:report   # validate & price every one of the 132 levels
npm run verify          # tests + production build (use before shipping)
```

## Testing

`npm test` runs seven suites:

| Suite | Covers |
| --- | --- |
| `tests/puzzles.test.js` | All 77 puzzle types: validation, solvability through real DOM clicks, determinism, par sanity, fail-safety |
| `tests/levels.test.js` | All 132 level definitions generate/validate/solve; chapter & difficulty ranges; secret unlock conditions |
| `tests/save.test.js` | Create, load, validate, repair, migrate (v1→v2), corruption recovery, quota failure, reset |
| `tests/scoring.test.js` | Star rules, monotonicity, score bounds, hint penalties, par sanity across the catalog |
| `tests/importexport.test.js` | JSON export/import, compact code, junk rejection, damaged-save repair, cross-device round trip |
| `tests/story.test.js` | 13 beats, all four endings reachable & deterministic, achievement predicates |
| `tests/app.test.js` | Boots the real game in jsdom and plays it: menu → story → level → solve → next, pause/resume, failure/retry, hints, level map, settings, export/reset/import, secrets, screen teardown |

Manual checklist that complements the automated tests (all of it is quick):

1. Play **levels 1–10** and confirm each new mechanic is explained before it is used.
2. On a phone: rotate the device mid-level; confirm no overflow at 320px width in portrait and landscape.
3. Pause during a level, wait 30 seconds, resume — the timer must not have advanced.
4. Use three hints, take the assist, confirm the level completes with one star and the score is forfeited.
5. Export a code, clear site data (or use a private window), import the code, confirm progress returns.
6. Turn on reduced motion and high contrast; play a memory level end to end.
7. Leave a level to the map mid-way, reload the browser, and confirm the game resumes at the right place.
8. `npm run levels:report` — must end with `all 132 levels generate, validate and expose a solution path.`

## Production build

```bash
npm run build      # writes dist/ (index.html, assets/, icons/, manifest, sw.js)
npm run preview    # optional: serve dist/ locally on http://localhost:4173
```

The build uses relative asset paths (`base: './'`), so `dist/` works from a domain root, a sub-path, or even a local static file server.

## Deployment: GitHub + Render

The repository is a static site: any static host works, and the steps below use Render's free static-site tier.

```bash
# 1. from the project root (only needed once)
git init
git add .
git commit -m "feat: build Neuro Void puzzle game"

# 2. push a feature branch
git checkout -b feature/neuro-void
git push -u origin feature/neuro-void
```

> If the repository already exists on GitHub, add its remote first:
> `git remote add origin https://github.com/<your-user>/<your-repo>.git`

**Pull request:** open a PR from `feature/neuro-void` into `main`, review the diff (no `node_modules/`, no keys, no `.env`), then merge. The game is self-contained, so the merge is a content merge with no conflicts expected.

**Render, step by step:**

1. Sign in to Render → **New +** → **Static Site**.
2. Connect the GitHub repository and pick the branch (`main` once the PR is merged, or `feature/neuro-void` to preview).
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Environment: none required (Node 18+ is the default; add `NODE_VERSION = 20` if you want to pin it).
6. Optional but recommended — add a rewrite rule so deep links never 404: **Redirects/Rewrites** → Source `/*`, Destination `/index.html`, Action `Rewrite`.
7. Click **Create Static Site**. Render installs, builds and publishes; the URL looks like `https://neuro-void.onrender.com`.
8. **Production test pass:** open the URL on desktop and mobile and check: the menu loads; CONTINUE or level 1 starts; the HUD timer runs; a level can be completed and the star screen appears; reloading keeps progress; Settings toggles persist; export/import works; a hard refresh with the network disabled still loads the game (service worker).

## Troubleshooting

**Blank screen after loading**
1. Open the browser console — a red error names the failing module.
2. Confirm the site was built (`npm run build`) and that the published directory really is `dist` (Render's *publish directory*, not the repository root).
3. If you are opening `dist/index.html` from the file system, serve it instead (`npm run preview`) — service workers and module loading need `http(s)://`.
4. As a last resort, clear this site's storage in the browser and reload: a corrupt save is repaired automatically, but a hard reset rules it out.

**Render build fails**
1. Read the first error, not the last: it is almost always a missing `package-lock.json` (commit it) or an unsupported Node version (set `NODE_VERSION = 20`).
2. Build command must be exactly `npm install && npm run build`; publish directory must be `dist`.
3. If `npm ci` is used instead, the lockfile must be committed and in sync with `package.json`.
4. A build that succeeds locally but fails on Render usually means a file was not committed. Run `git status` and add anything missing.

**Save not loading**
1. Check the header indicator: `READY`/`SAVED` means the store is working; `STORAGE OFF` means the browser blocked localStorage (private mode or site settings).
2. Confirm you are on the same origin (protocol + host + port). `http://localhost:5173` and `https://neuro-void.onrender.com` have separate storage.
3. Use **IMPORT / EXPORT SAVE** to move progress from wherever it is to wherever you want it.

**Corrupted save**
1. The game repairs what it can and reports it (`REPAIRED` / `RECOVERED`); unreadable data is copied to `neurovoid_save_v1_corrupt` and a backup is used when available.
2. If progress still looks wrong, import your last export. If you have none, reset from Settings — you keep your audio and accessibility settings.

**Mobile controls not responding**
1. Make sure you are on the latest page load (stale service-worker caches are updated automatically, but a hard refresh forces it).
2. Tap directly on the control; every target is at least 44×44 CSS px, but very narrow zoomed-in views can shift layout — reload or reset zoom.
3. If a level looks like it needs more room, rotate to landscape. Only the few wide puzzles show an orientation hint; everything remains playable in portrait.

**Safari-specific issues**
1. Web Audio can stay suspended until the first tap — the game unlocks it on your first interaction, so tap once anywhere if you hear nothing.
2. Private browsing blocks localStorage: the game still plays, but nothing persists — export is unavailable in that mode, so use a normal window for real progress.
3. iOS clips content near the notch/home bar unless `viewport-fit=cover` is honoured; the layout uses safe-area insets, so keep the game updated and avoid injecting custom CSS.

**Assets missing / icons or fonts look wrong**
1. All art is vector or generated at runtime; there are no font downloads (the game uses system fonts). A missing icon means the `public/icons/` files were not committed.
2. Regenerate the PNG icons any time with `node scripts/make-icons.mjs`.

**Production build problems**
1. `npm run verify` must pass locally (tests + build) before you deploy.
2. If the bundle builds but the game misbehaves only in production, check that `dist/` is freshly built and that the service worker in your browser is not serving a cached older bundle — hard refresh once, and bump `CACHE_VERSION` in `public/sw.js` when you ship a breaking change.

## Known limitations

- localStorage does not sync between devices (see [Save system](#save-system) for the export/import workaround).
- Progress lives per browser origin: a different port, sub-domain or protocol is a different save.
- Web Audio must be unlocked by a user gesture; the first sound may therefore arrive one tap late.
- Very old browsers without ES2019 support are not targeted (Chrome/Firefox/Safari/Edge, current and previous major versions are).
- Achievements and secret chambers are recorded locally only; there is no online leaderboard, by design.

## License

MIT — see [LICENSE](LICENSE).
