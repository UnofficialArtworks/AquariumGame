# Aquarium game — current handoff

Updated October 1, 2026 by Codex, continuing Claude's cleaning tools, gadgets, stands and flicker work.

## GitHub Pages setup

- Added `.github/workflows/pages.yml`: Node.js 24, `npm ci`, lint/typecheck/tests/audit/build, Pages artifact upload and deployment. Uses official actions pinned to the revisions in Vite's current deployment guide. Checks run on PRs; publishing runs only on the repository's default branch (also supports `master` and custom names) or a manual run on that branch. Deployment uses the `github-pages` environment with minimal job permissions and serialized publishing.
- Keeps Vite `base: './'`; built asset and favicon paths are relative and can be served below any repository name. Only `dist/` is published, excluding source, handoff, QA fixtures and development artifacts.
- README now covers enabling Pages with **Source: GitHub Actions**, first deployment, automatic updates and rollback.
- Published to `https://github.com/UnofficialArtworks/AquariumGame`, with local `main` tracking `origin/main`. Initial project commit: `7740f76`. Pages is enabled with `build_type: workflow` and HTTPS enforced. The existing Git Credential Manager sign-in was used for the push and GitHub API settings; no credential was printed, saved to the project, or added to the workflow.
- **Live game:** `https://unofficialartworks.github.io/AquariumGame/`. GitHub Actions run `36935780771`, attempt 2, completed successfully: all Linux build checks and deployment passed. The first attempt finished building before Pages was enabled, so its deployment job was retried after setup.
- Public-site browser verification: aquarium renders, all three starter fish load, the shop opens and shows items in unlock order, and no runtime errors were recorded. Existing Three.js Clock deprecation warnings remain. Screenshot: `artifacts/github-pages-live.jpg`. Localhost progress stays separate from the public site's save.
- Future pushes to `main` rebuild and publish automatically. Revert a faulty commit and push to roll back. GitHub CLI is not installed; repository settings were configured through GitHub's official REST API.

## Latest pass (Codex: reach, menus, species variation and egg batches)

- **Glass tools reach the bottom and corners.** The old head clamp used gravel height even though algae extends to `TANK_BOTTOM_Y`. `cleaning/glassReach.ts` now clamps against the glass bottom and allows the pad to overlap corner seams. Tests first reproduced the unreachable bottom row and corner cells, then verified that all four glass tools can clear them on all four walls. Canvas pointer tracking, wall locking, camera controls and HUD hiding remain in place.
- **Decoration palette:** a compact horizontal strip with a Hide palette / Choose another control. It collapses when an item is placed or selected and while dragging. Rotate / Remove / Done remain accessible. Checked on desktop and a 390×844 phone viewport. Screenshot: `artifacts/decoration-palette.png`.
- **Background shader:** every descending `smoothstep` was replaced with an inverted ascending fade. Reversed edges have undefined GLSL results. UVs are clamped before fractional powers, and the custom backdrop now has the same NaN/HDR guard as built-in materials. Background materials dispose on replacement. This addresses another plausible flicker source beyond Claude's earlier fix; the reported intermittent issue was not reproduced on demand. An isolated frame monitor detected **0 fully black frames** over Coral Reef for 45 seconds (7,803 sampled frames) and each of the other seven backgrounds for 10 seconds (10,650 combined sampled frames). This detects whole-frame flashes, not every possible local visual artifact.
- **Individual size:** every species has an explicit `sizeRange` in `fishDefinitions.ts`. Starter, purchased and newly hatched fish sample a permanent `FishInstance.sizeScale`; all fish and special-creature renderers multiply it by growth size. Saving/reloading keeps the same size. Existing fish migrate at scale 1 to preserve their appearance. Adult goldfish at the range endpoints were visibly different in browser QA.
- **Egg batches:** every species also has `eggCountRange`, within 1–6. The **first selected friend's species** determines the clutch range (shown in the nursery); count is sampled once at round start and stored as `NurserySession.eggCount`. Each egg separately gets its body/color inheritance and random species hatch timer. A start requires space for the species maximum; once started, only the sampled count is reserved. Offline catch-up creates and advances the whole clutch without repeating it.
- **Nursery capacity is 12**, so two parents plus six eggs fit. Capacity includes fish, existing eggs and the full active reservation. Eggs now use a four-column, three-row display. Browser QA showed six eggs and a two-egg active reservation correctly. Screenshot: `artifacts/nursery-batch.png`.
- **Shop:** all seven categories sort by unlock level, then price, then original catalog order for ties.
- **Save version is 5.** v1–v4 still migrate. Old active rounds retain their original single egg; old fish keep scale 1; pending clutches and sizes persist without rerolling.
- **Validation:** `npm test` passes 33 tests; typecheck, production build and `npm run lint -- --quiet` pass. The existing production bundle-size warning remains (~1.71 MB minified / 521 KB gzip). Browser hook dependency warnings during live source edits disappeared after a fresh reload; final runtime inspection used a fresh fixture.
- **Manual QA:** `/tests/visual.html` on a separate Vite port supplies six eggs, size-endpoint adults, all decor and backgrounds, plus a visible frame-monitor button. Game-state persistence is disabled in this fixture. Its algae save belongs to that separate origin; never use fixtures on the player's normal port. These entries are excluded from production.

## Previous pass (Claude)


- **Flicker fixed.** The occasional one-frame black flash came from NaN pixels. In the bubble and coin shaders (and the water-surface fresnel), `pow(1.0 - abs(dot(n, v)), k)` could get a tiny negative base. The mipmap bloom then smeared that one NaN pixel across the whole frame. The bases are now clamped. A global HDR guard is also appended to `THREE.ShaderChunk.opaque_fragment` and after the aqua water tint (`aquaShader.ts`). It zeroes NaN and caps brightness at 48, so a stray specular glint can't overflow the half-float buffer. Checked with an in-page frame monitor: about 1 black frame every 10–20 s before the fix, 0 in 130 s after.
  - The 3D scene also no longer re-renders every second. `tick()` keeps the same `ownedFish`/`fishVitals` arrays when nothing hatched. `PostFX` and `SceneEnvironment` are memoized, because EffectComposer rebuilds its passes whenever its children change identity.
- **Cleaning tools stay inside the tank.** Tools track the pointer at canvas level (`useCanvasPointer` in `cleaning/CleaningTools.tsx`) and raycast the glass and gravel themselves every frame.
  - Glass tools pick the nearest wall under the pointer and lock to it while dragging. They project onto that wall's plane and clamp the head inside the glass rectangle, above the gravel and below the rim. If the pointer leaves the tank, the tool slides along the edge instead of vanishing. `AlgaeGlass.tsx` is now visual only.
  - Gravel tools intersect the bumpy floor iteratively and clamp the nozzle inside the glass.
  - With a tool in hand, a left-drag or one-finger drag never orbits (OrbitControls `LEFT`/`ONE` are unset). Right-drag, two fingers, or **Move camera** orbits.
  - Fast strokes sweep the whole path, from the press point and between frames.
- **Waste is visible.**
  - Bigger pellets and crumbs rest on top of the pebbles, with a grimy smudge decal under each one.
  - In Clean mode, pulsing outlined rings mark each piece; they're bigger with the vacuum. A custom shader (`cleaning/ringMaterial.ts`) gives a dark outline plus a bright band, drawn on top, so the rings read on pale sand, dark gravel, and behind decor.
  - The clean panel shows a live waste count.
- **Vacuum rebuilt.**
  - A clear siphon tube with gravel tumbling inside, a colored collar, and a hose that arches over the nearest side rim down to a bucket beside the stand.
  - A suction ring, plus a pull ring and whirlpool on the upgraded vacuums.
  - Waste skids into the nozzle, then shoots up the tube.
  - Upgraded vacuums drag nearby waste toward the nozzle. These are visual offsets in `wastePull`, committed with the store action `relocateWaste` on release.
- **Tools shop tab.**
  - `cleaning/toolDefinitions.ts` defines seven tools:
    - Sponge
    - Pro Squeegee (Lv3, 3× wider)
    - Magnet Scrubber (Lv6; its partner magnet rides outside the glass)
    - Turbo Spin Scrubber (Lv10)
    - Gravel Vacuum
    - Turbo Siphon (Lv4)
    - Hydro-Vac 3000 (Lv9)
  - Tools are equipped per category. The clean panel has chips to switch tools and a "Better tools →" link.
  - `scrubAlgae` takes an optional elliptical `radiusY`.
- **Gadget decorations (passive bonuses).** A bonus is active while at least one copy is placed in the main tank; extra copies don't stack (`state/bonuses.ts`).
  - Marimo Moss Balls: −35% algae growth, live and offline.
  - Bubble Filter Tower: −40% murk, in the tick and offline.
  - Auto-Feeder Lighthouse: pops 4 pellets from its lantern about every 40 s while any main-tank fish is over 40% hungry (`sim/autoFeeder.ts`, verified in the browser). Offline, it caps main-tank hunger at 45%.
  - Sunstone Coral: +25% growth per meal, main tank only.
  - Lucky Coin Fountain: +30% coin-bubble rate, live and offline.
  - Models are in `decorations/builders/gadgets.ts` and animations in `decorations/GadgetFx.tsx`. Shop cards and the decorate palette show a ✨ bonus badge, which turns to ✓ when active.
- **Stands.**
  - `stands/standDefinitions.ts` has 9 styles: Walnut (default), Arctic Gloss, Bubblegum Vanity, Turbo Racer, Tiki Bamboo, Pirate Treasure Chest, Mermaid Lagoon, Space Station, Rainbow Candy.
  - There's a new **Stands** shop tab, and the save holds `standId`/`unlockedStandIds`.
  - Visuals are in `stands/StandVisual.tsx`, rendered by `TankScene` in place of the old `Cabinet` in `TankContainer`.
- The save stays at v4. `sanitize` fills in and validates the new fields (`standId`, `unlockedStandIds`, `ownedToolIds`, `equippedGlassTool`, `equippedGravelTool`), falling back to the starter sponge, vacuum and walnut stand.

## Earlier state (Codex)

- The black 3D render is fixed: `EffectComposer` uses `multisampling={0}` plus SMAA.
- HUD and shop rebuilt, including:
  - food/treat picker, cleaning tools and health meters
  - fish info, name editing and follow
  - toasts and level-up/welcome-back panels
  - day/night, sound and PNG photo
- Creature thumbnails use the real seahorse, axolotl, snail and shrimp visuals. Aquarium renaming, home/nursery switch, fish roster, transfers, sales, and the **Bubble Buddies** nursery loop are in.
- **Nursery:**
  - Any two fully grown fish, including different species, can pair. A pair starts a 120-second friendship round that produces one visible egg; parents stay.
  - Capacity is six, counting fish, eggs, and a reserved slot for an active round.
  - Eggs have species-specific hatch windows. Total and remaining time both persist.
  - Offline catch-up first finishes the friendship, then applies only the leftover time to the egg.
  - Hatchlings are 10% grown.
- **Inheritance:** body/species comes from one random parent and colors from the other. This is stored in `inheritance` and passes through later generations.
- **Growth:** `sizeForGrowth` scales hatchlings to .50 and adults to 1.22.
- **Economy:** sales depend on growth and home-tank cleanliness (up to a 25% bonus). Passive income is deliberately slow (.005 coins/s active, .001 offline), and coin bubbles come every 600–900 s.
- Nursery is auto-filtered. Food and coin bubbles are tagged by habitat, and only visible fish have live movement.
- Save v4 migrates v1–v3.

## Validation

- `npm test`: 29 passing. This pass added tests for:
  - tool purchase, equip and sanitize
  - stand buy, switch and fallback
  - gadget bonuses, including the offline auto-feeder
  - relocated-waste clamping
- `npm run typecheck` (`tsc -b`) is clean.
- Checked in the browser this pass:
  - flicker monitor
  - sponge clamping at edges and corners
  - scrubbing (algae % drops, coins rise)
  - vacuum sweep (9 → 3 waste in two swipes)
  - waste rings on pale sand
  - all five gadget models in the tank
  - auto-feeder firing
- `npm run build` passes. `oxlint` reports only warnings of the kinds already tolerated (R3F mutation/immutability in scene components; new ones in `CleaningTools.tsx` and `GadgetFx.tsx`).
- All 9 stands were viewed in the browser and look distinct. Arctic reads a bit grey in the tank's shadow and could be brightened.
- The stand models (`StandVisual.tsx`) were built by a Sonnet subagent.
  - Each style uses 2–6 draw calls and roughly 7k–44k triangles (mermaid and candy are the heaviest).
  - Each style's geometry is built and cached the first time it's shown, so the first switch to a new stand can hitch for up to about 70 ms.
  - Its z-fight scan found no overlapping faces.
  - A few trims stick out past the stand box by up to about 0.27: the bubblegum skirt, the pirate medallion and brackets, and the candy drips.
- Manual nursery fixture: `/tests/nursery.html`.

## Dev-environment gotcha

On this machine (W: drive), Vite's file watcher sometimes misses the second of two quick edits to the same file. The dev server then keeps serving the stale module; the symptom is `X is not defined` for something that's clearly imported. Run `touch <file>` and reload. This is not a code bug.

## Architecture

- `src/state/useGameStore.ts`: persistence and economy, plus tool, stand and waste-relocation actions. Other state modules:
  - `state/bonuses.ts`: gadget multipliers, cached per placed-decorations array.
  - `state/nursery.ts`: hatch windows and inheritance.
  - `state/economy.ts`: tuning.
- `src/state/useUIStore.ts`: active tank, modes, selection, shop tab (`tools` and `stands` added), cleaning-camera toggle.
- `src/scene/TankScene.tsx`: home/nursery scenery, stand, and cleaning tools.
- `src/scene/cleaning/`:
  - `CleaningTools.tsx`: pointer plumbing and the glass and gravel tool rigs.
  - `WasteLayer.tsx`: waste, smudges, rings and suck-up animation, plus `wastePull`.
  - `AlgaeGlass.tsx`: visual only.
  - `toolDefinitions.ts`, `ringMaterial.ts`.
- `src/sim/`: frame-loop systems, including `autoFeeder.ts` and `gadgets.ts` (`gadgetPulses`, which tells the feeder FX when to animate).
- `src/ui/HUD.tsx` (the clean panel has tool chips), `ShopPanel.tsx` (7 tabs), `ShopItemCard.tsx` (`badge` prop), `InventoryPanel.tsx` (gadget badges).

## Next opportunities

- Playtest the feel: tool strengths, vacuum pull speeds, gadget and stand prices, ring sizes on phones. The upgraded glass tools (squeegee, magnet, turbo) and vacuums (turbo, hydro) haven't been seen in motion yet; check their look and whether they clamp correctly at the glass edges.
- Gadget triangle counts (growlamp about 21k, marimo about 16k) could be trimmed if performance is tight. Brain coral is also dense.
- Economy pacing, real-device performance, scene lint warnings, bundle splitting.
- Ideas only: daily goals, achievements, party treat, octopus. No hosting, backend or accounts yet.

The earlier Claude pass left everything uncommitted. The complete game and Pages setup have since been committed and pushed to `main`; see the deployment section above.
