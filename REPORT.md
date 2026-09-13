# NEURO//VOID — delivery report

Repository: `balayya00/Void` · Branch worked on and pushed: `arena/01a09bc6-void` · Commit: `fbe0051 feat: build Neuro Void puzzle game` · Pull request: <https://github.com/balayya00/Void/pull/1> (base `main`)

---

## 1. Project summary

**NEURO//VOID** is a finished, playable browser puzzle game — not a prototype or a design document. You wake on a sealed space station; a voice called ARIA leaves you experiments. Solving them reveals what the station is, what she is, and what you are.

Delivered scope:

- **132 level definitions**: 120 main levels (12 chapters × 10) plus 12 secret chambers (121–132).
- **77 reusable puzzle generators** across the seven required categories: Pattern 9 types / 15 levels, Memory 10 / 15, Logic (incl. deduction) 15 / 26, Spatial 10 / 18, Observation 8 / 14, Strategy 9 / 15, Experimental 16 / 29. Every registered type is used by at least one level.
- **Guaranteed solvability**: every generator computes its answer from an explicit rule and validates it; `buildChoices()` throws rather than ship a question whose correct answer is missing. All 132 levels are additionally *played to completion through real DOM clicks* in the automated suite (`tests/levels.test.js`), and `npm run levels:report` exits non-zero if any level is broken.
- **Gradual teaching**: Chapter 1 introduces the ten starter mechanics one per level (`taught:` tags), later chapters reuse the same engines at higher difficulty instead of spiking.
- **Story & endings**: 13 story beats (one per chapter plus the secret archive) with recorded decisions, and **4 endings resolved deterministically** from choices, secrets, stars and performance — no RNG anywhere in the ending logic.
- **Meta progression**: level map with chapters, 1–3 star ratings with published rules, best score/time per level, completion %, 31 achievements, secret-chamber tracking, four-door ending archive.
- **Secrets**: 12 chambers unlocked by total stars, badges, fully completed chapters, specific story decisions and the number of chambers already found. Two need deliberate UI exploration (a menu control that is not labelled as one; a chamber that is solved by doing nothing).
- **Save system**: `neurovoid_save_v1`, schema v2, validation + repair on every load, v1→v2 migration, rolling backup, corruption recovery, autosave with an indicator, reset/new game, JSON file export/import and a compact `NV1-…` pasteable code.
- **Mobile-first & accessible**: 44×44 CSS px targets, touch/mouse/keyboard parity, no hover-only interactions, no colour-only puzzles, responsive from 320px with no overflow, reduced motion / high contrast / larger text, optional synthesised audio.
- **Offline PWA**: manifest + service worker, installable, no CDN, no account, no server, no runtime dependencies.
- **Quality gates**: 430 automated tests in 7 suites, all green; production build produces a ~304 KB JS + ~36 KB CSS bundle.

## 2. File structure

```
Void/
├── index.html                     # app shell: boot screen, noscript fallback, module entry
├── package.json                   # scripts: dev, build, preview, test, test:watch, levels:report, make:icons, verify
├── package-lock.json              # committed lockfile (Render/npm ci safe)
├── vite.config.js                 # base './', single bundle, 0.0.0.0 dev server, open allowed hosts, vitest/jsdom
├── .gitignore                     # node_modules, dist, .env*, *.key, *.pem, secrets, logs, coverage, editor clutter
├── README.md                      # full documentation (setup, deploy, save system, testing, troubleshooting)
├── LICENSE                        # MIT
├── REPORT.md                      # this report
├── public/
│   ├── manifest.webmanifest       # PWA metadata (name, icons, standalone, theme)
│   ├── sw.js                      # offline service worker (cache-first + background refresh, navigate fallback)
│   └── icons/                     # icon.svg + generated icon-192.png, icon-512.png, maskable-512.png
├── scripts/
│   ├── level-report.mjs           # generates/validates/prices all 132 levels; exits 1 on any failure
│   └── make-icons.mjs             # dependency-free PNG icon generator (zlib + CRC32)
├── src/
│   ├── main.js                    # boot(): save → audio → shell → game → 12 screens → menu → service worker
│   ├── core/
│   │   ├── Game.js                # controller: screen hosting, level lifecycle, timer, pause, hints/assist, results
│   │   ├── GameState.js           # explicit state machine with a legal-transition table
│   │   ├── EventBus.js            # decoupled events (audio, toasts, achievements, save status)
│   │   ├── AudioManager.js        # procedural Web Audio; silently degrades when unavailable
│   │   └── AutoSolver.js          # replays a level's own solution for the "let the station finish it" assist
│   ├── levels/
│   │   ├── levelData.js           # CHAPTERS (12), SECRET_CHAPTER, 120 LEVELS, 12 SECRET_LEVELS, lookups
│   │   └── LevelManager.js        # level descriptor, generation, validateLevel/validateCatalog, stars, score, unlocks
│   ├── puzzles/
│   │   ├── index.js               # registry: PUZZLE_TYPES (77), PUZZLE_CATEGORIES, getPuzzleType()
│   │   ├── kit.js                 # widgets: grids, choices, hold buttons, answer input + keypad, meters, countdown
│   │   ├── common.js              # buildChoices (answer-safe), distractors, sequences, RNG helpers
│   │   ├── pattern|memory|logic|deduction|spatial|observation|strategy|meta Puzzle.js
│   │   └── puzzleApi.js           # import barrel used by the puzzle modules
│   ├── save/
│   │   ├── SaveManager.js         # load/save/reset, export/import, status events, secret & achievement grants
│   │   ├── SaveValidator.js       # never-throwing repair pipeline, SAVE_VERSION 2, storage keys
│   │   ├── SaveMigration.js       # v1 → v2 migration table
│   │   └── Achievements.js        # 31 achievement definitions + snapshot/predicates
│   ├── story/StoryData.js         # 13 beats, 4 endings, deterministic resolveEnding()
│   ├── ui/                        # Shell, MenuScreen, LevelSelect, PlayScreen, ResultScreens, SystemScreens, StoryScreen
│   ├── styles/                    # tokens.css, base.css, layout.css, screens.css, puzzles.css
│   └── utils/                     # dom.js, rng.js (seeded), shapes.js (18 glyphs), grid.js (BFS/paths)
└── tests/
    ├── setup.js, harness.js       # jsdom shims + the DOM play harness (mount → click → solved)
    ├── puzzles.test.js            # 309 tests across all 77 puzzle types
    ├── levels.test.js             # catalog integrity + every level played through the DOM
    ├── save.test.js               # create/load/validate/repair/migrate/corrupt/quota/reset
    ├── scoring.test.js            # star rules, score bounds, par sanity
    ├── importexport.test.js       # JSON + compact code round trips, junk rejection, damaged repair
    ├── story.test.js              # beats, all four endings reachable & deterministic, achievements
    └── app.test.js                # boots the real game and plays it end to end
```

## 3. Technologies

| Layer | Choice |
| --- | --- |
| Markup / styling | HTML5, CSS3 (custom properties, grid, `prefers-reduced-motion`), no CSS framework |
| Logic | Vanilla JavaScript ES modules — no framework, **zero runtime dependencies** |
| Graphics | Inline SVG + DOM. 18 procedurally drawn glyphs, 6 fill styles, rotated/scaled variants, no image assets in gameplay |
| Audio | Web Audio API — every sound and the ambient bed are synthesised at runtime (no audio files, nothing to download) |
| Build | Vite 5 (`base: './'`, single hashed bundle, `es2019` target) |
| Tests | Vitest 2 + jsdom 24, headless DOM play harness |
| Offline | Web app manifest + service worker (cache-first with background refresh) |
| Deploy target | Any static host; instructions for Render Static Site |

Deliberately **not** used: Phaser (the DOM is a better fit for accessible, interactive puzzle UI), any CDN, any server, database, auth, WebSockets, or heavy 3D.

## 4. Local setup

Requires Node.js 18+ (Node 20 LTS recommended).

```bash
npm install          # installs vite, vitest, jsdom (the only devDependencies)
npm run dev          # dev server on http://localhost:5173 (bound to 0.0.0.0)
```

Useful companions:

```bash
npm test              # 430 tests, ~15 s
npm run test:watch    # watch mode while developing
npm run levels:report # validate + price all 132 levels (also a CI gate)
npm run make:icons    # regenerate the PNG launcher icons
```

The dev server accepts any host (LAN IP or hosted preview proxy), and all asset paths are relative, so the same build works from a root domain, a sub-path or a local preview.

## 5. Production build

```bash
npm run verify        # tests + production build (recommended before shipping)
npm run build         # writes dist/
npm run preview       # serve dist/ locally on http://localhost:4173
```

`dist/` contains `index.html`, `assets/game.<hash>.js` (~304 KB), `assets/style.<hash>.css` (~36 KB), `icons/`, `manifest.webmanifest` and `sw.js` (~400 KB total, no external requests). Because `base` is `'./'`, the folder can be published anywhere.

## 6. Exact git commands

These are the commands the repository was built with (they also work on a fresh clone):

```bash
# from the project root
git init                                   # only if the folder is not a repository yet
git add .
git commit -m "feat: build Neuro Void puzzle game"

# create and publish the feature branch
git checkout -b feature/neuro-void
git push -u origin feature/neuro-void

# if the remote is not configured yet
git remote add origin https://github.com/<your-user>/<your-repo>.git
git remote -v                              # confirm fetch and push URLs
```

What was actually executed in this session:

```bash
git add -A
git commit -m "feat: build Neuro Void puzzle game"      # → fbe0051 (65 files, 19 038 insertions)
git push -u origin arena/01a09bc6-void                  # succeeded: branch now on GitHub
```

> **Note on branch naming:** this working session is pinned to the branch `arena/01a09bc6-void`, which is what was committed and pushed (that branch is the one the environment tracks). The repository content is identical to what a `feature/neuro-void` branch would contain — to publish it under that name, run the three `feature/neuro-void` commands above from the pushed commit.

## 7. Pull request instructions

A pull request already exists: **<https://github.com/balayya00/Void/pull/1>** — base `main`, head `arena/01a09bc6-void`, titled *feat: NEURO//VOID — 120-level browser puzzle game*, with a full description of the feature set and the review notes (no secrets, no `node_modules/`, no `dist/`).

To open an equivalent PR from a feature branch instead:

1. `git checkout -b feature/neuro-void && git push -u origin feature/neuro-void`
2. On GitHub → **Pull requests** → **New pull request** → base `main`, compare `feature/neuro-void`.
3. Review the file list: expect ~65 added files; **nothing** under `node_modules/`, `dist/`, no `.env`, `*.key` or `*.pem`.
4. Confirm the checks you care about locally first: `npm run verify` (tests + build).
5. Click **Create pull request**, then **Merge pull request** (a normal merge is fine — this is an additive feature branch and `main` has no competing changes).
6. After merging, delete the branch if you like; Render will rebuild from `main` automatically.

## 8. Render instructions

1. Sign in to <https://render.com> and choose **New + → Static Site**.
2. Connect the GitHub repository `balayya00/Void` and select the branch to deploy (`main` after the merge; `arena/01a09bc6-void` or `feature/neuro-void` for a preview environment).
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Environment variables: none required. Optionally add `NODE_VERSION = 20` to pin Node.
6. Optional but recommended — **Redirects/Rewrites**: Source `/*` → Destination `/index.html` → Action `Rewrite`, so deep links and refreshes never 404.
7. Click **Create Static Site**. The first build takes a minute or two; the URL is shown at the top of the page (for example `https://neuro-void.onrender.com`).
8. **Production test pass on the live URL:**
   - The main menu appears with CONTINUE, NEW GAME, LEVELS, ACHIEVEMENTS, SETTINGS, IMPORT/EXPORT SAVE, CREDITS.
   - CONTINUE or level 1 opens a puzzle; the HUD timer runs and PAUSE works.
   - Solve a level: the success screen shows stars, score and time; NEXT advances.
   - Reload the page: progress, settings and stars are still there.
   - Settings: toggle music/SFX, reduced motion, high contrast, larger text; confirm they persist after a reload.
   - Save data: export a code, reset, import the code back, confirm progress returns.
   - Offline: load once, then disable the network and reload — the game still starts (service worker).
   - Mobile: open on a phone, play one level in portrait and one in landscape; no overflow, no zooming required.

## 9. Save-system explanation

**Storage.** One localStorage entry, `neurovoid_save_v1` (schema version 2), plus `neurovoid_save_v1_backup` (the previous good value) and `neurovoid_save_v1_corrupt` (evidence, if a load ever failed). Nothing leaves the device and no account exists.

**Lifecycle.**

1. **Load** — read the primary key, else the backup, else create a fresh save (which is written immediately).
2. **Migrate** — `migrateSave()` walks a table of pure functions (v1 → v2 converts the old flat `stars` map into per-level records and merges the old audio settings).
3. **Validate & repair** — `validateSave()` never throws: it clamps out-of-range level numbers, drops impossible completion records, restores missing settings, recomputes star totals, and fixes inconsistent progress (`unlockedLevel` behind the completed levels, level claims without completions). Everything it changed is reported in the UI (`REPAIRED`, `RECOVERED`).
4. **Play** — results, choices, badges, secrets and settings are written through `SaveManager`; saves are debounced and always finalised on a level result, on `visibilitychange`, on `pagehide` and on `beforeunload`.
5. **Quota / private mode** — a rejected write degrades to a memory-only session, tells the player storage is unavailable, and keeps the game fully playable (some browsers throw on every `setItem`).

**Scoring ties into saving.** `completeLevel()` keeps the best stars, best score, best time and the lowest hint count, advances `unlockedLevel` by exactly one level, and reports whether the run improved the record.

**Portability.**

- **Export** — a `.json` file (`{ app, exportedAt, schema, save }`) or a compact `NV1-` code (base64url of a trimmed save: version, unlocked level, completed map, achievement ids, secret ids, story choices, tutorial flags, settings).
- **Import** — a code, exported JSON, a bare save object from any schema version, or a picked file. Payloads that do not look like a NEURO//VOID save at all are **rejected without touching current progress**; repairable payloads are imported and reported.

**Documented limitation.** localStorage does not sync between devices or browsers, can be blocked in private mode, and is erased if the user clears site data. The game detects all three cases and warns instead of losing silently. The workaround is the export/import path above — the README states this in the *Save system* and *Known limitations* sections.

## 10. Testing checklist

Automated (`npm test` → **430 passing**, 7 suites):

| # | Check | Where |
| --- | --- | --- |
| 1 | All 77 puzzle types validate, are solvable through real DOM clicks, are deterministic per seed, report usable par, and never solve themselves | `tests/puzzles.test.js` |
| 2 | All 132 level definitions generate, validate and expose a solution path; every level is played to completion through the DOM; reduced-motion/high-contrast mounts work | `tests/levels.test.js` |
| 3 | Chapters 1–12 cover 1–120, secrets 121–132, unique numbering, ≥40 distinct puzzle types used, teaching tags in Chapter 1, secret unlocks are condition-based | `tests/levels.test.js` |
| 4 | Save create/load/validate/repair, out-of-range and impossible data, star recomputation, v1→v2 migration, corrupt JSON recovery, backup recovery, quota failure, best-result retention, secret & badge idempotency, reset | `tests/save.test.js` |
| 5 | Star rules (monotonic, always ≥1 star, never >3), score bounds 50–5000, hint penalties, difficulty scaling, par sanity across the catalog | `tests/scoring.test.js` |
| 6 | Export/import round trip (file and code), cross-device simulation, junk rejection without data loss, damaged-save repair, legacy import | `tests/importexport.test.js` |
| 7 | 13 beats, 2–4 choice options, **all four endings reachable and deterministic**, achievement predicates never throw, chapter counting | `tests/story.test.js` |
| 8 | Real boot: menu entries, story → level → solve → success → next, autosave and unlock, pause/resume keeps the same DOM, restart determinism, failure screen → retry, hints → assist, timer teardown, level map & chapter tabs, settings persistence, save screen export/reset/import, secrets, corrupt save on boot, blocked storage | `tests/app.test.js` |
| 9 | CLI gate: `npm run levels:report` ends with *"all 132 levels generate, validate and expose a solution path"* and exits non-zero otherwise | `scripts/level-report.mjs` |

Manual pass (recommended before a public launch):

1. Play levels 1–10 and confirm each mechanic is taught before it is used.
2. Play the four doors: reach at least two different endings by changing choices/secrets.
3. 320 px phone check: no horizontal scroll, no clipped buttons, portrait and landscape.
4. Keyboard-only run: complete a level using Tab/Enter/arrows only, and pause with `Esc`.
5. Export → clear site data → import on the same device; then repeat across two devices.
6. Offline launch after a hard load (airplane mode + reload).
7. Reduced motion + high contrast + larger text all enabled together; play a memory level and a maze.

## 11. Troubleshooting

**Blank screen.**
1. Open the console; the first red error names the failing module.
2. Confirm the published directory is `dist` and that `index.html` at the site root references `./assets/…` (relative paths).
3. If you opened `dist/index.html` from the file system, serve it instead (`npm run preview`) — ES modules and service workers require `http(s)://`.
4. Clear the site's storage and reload: a corrupt save is repaired automatically, but this rules it out.

**Render build failure.**
1. Read the *first* error: usually a missing `package-lock.json` (it is committed here — don't remove it) or an old Node version (set `NODE_VERSION = 20`).
2. Build command must be `npm install && npm run build`; publish directory must be `dist`.
3. If you switch to `npm ci`, the lockfile must stay in sync with `package.json`.
4. A build that passes locally but fails on Render usually means a file was never committed — run `git status`.

**Save not loading.**
1. Check the header indicator: `READY`/`SAVED` = working; `STORAGE OFF` = the browser blocked localStorage (private mode or site settings).
2. Progress is per origin: `http://localhost:5173`, `http://127.0.0.1:5173` and your Render URL each have their own storage.
3. Use IMPORT / EXPORT SAVE to move progress deliberately.

**Corrupted save.**
1. The game repairs what it can and reports `REPAIRED`/`RECOVERED`; unreadable data is preserved under `neurovoid_save_v1_corrupt` and the backup is used when it is usable.
2. If progress still looks wrong, import your most recent export.
3. With no export, reset from Settings — audio and accessibility settings are kept.

**Mobile controls.**
1. Tap the control directly; every target is at least 44×44 CSS px. Avoid pinch-zooming mid-puzzle, or reload to restore the standard scale.
2. If a puzzle looks cramped, rotate to landscape — only the genuinely wide puzzles show an orientation hint, and all remain playable in portrait.
3. Vibration, dragging and multi-touch are never required; if a tap seems ignored, check whether a hint or pause overlay is open (the board is intentionally inert behind overlays).

**Safari.**
1. Audio can start suspended until the first interaction — tap once anywhere if you hear nothing (visual feedback never depends on audio).
2. Private browsing blocks localStorage: the game plays but nothing persists, and export is unavailable.
3. On notched iPhones the layout uses safe-area insets; if content sits under the home bar, update to the latest deploy and avoid injecting custom CSS.

**Missing assets.**
1. There are no gameplay image assets and no font downloads (system fonts, inline SVG, generated PNG icons). A missing icon means `public/icons/` was not committed — regenerate with `npm run make:icons`.
2. A 404 on `sw.js` only disables offline caching; gameplay is unaffected.

**Production build.**
1. Always run `npm run verify` before deploying (tests + build).
2. If the app misbehaves only in production, a stale service worker may be serving an older bundle: hard-refresh once, and bump `CACHE_VERSION` in `public/sw.js` for breaking releases.
3. To reproduce production locally: `npm run build && npm run preview` and test on `http://localhost:4173`.
