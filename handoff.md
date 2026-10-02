# Aquarium game — current handoff

Updated October 2, 2026 by Claude (late-game unlocks, rare morphs and the Fishpedia), on top of Codex's iPad/Pages work.

## Latest pass (Claude): late-game unlocks, rare morphs and the Fishpedia

**Status:** done and verified in the QA page (close-ups by day and night, shop thumbnails, a cost check). Typecheck and lint are clean, 37 tests pass, and the build works.

### Late game (levels 13–30)

Every level from 13 to 30 now unlocks something. A test enforces this.

- **New fish** (`fishDefinitions.ts`, all drawn by FishBody):
  - Regal Tang (14), Moorish Idol (16), Flowerhorn (19)
  - Starry Pleco (22), Emperor Angelfish (26), Celestial Dragon Koi (30)
- **New creature kinds**, each a `XVisual` + `XEntity` wired into `FishEntity.tsx` and `ItemPreviewGenerator.tsx`. All three take morph palettes.
  - **Octopus** (`Octopus.tsx`, 17, bottom zone, `orientation: 'yaw'`):
    - Head and mantle with spotty, pale-bellied skin baked as vertex-colour tones.
    - Eight merged arms carry an `aArm` attribute (position along the arm, arm angle). A vertex shader handles:
      - alternate-pair stepping while it crawls;
      - waves flowing down the arms and curling tips;
      - a startle "jet" that streams the arms back.
    - Per-instance skin materials drift between `color` and `color2`, flush toward `color3` when startled, and the mantle breathes. 3–4 draw calls.
  - **Manta Ray** (`MantaRay.tsx`, 20, `orientation: 'full'`):
    - A custom two-skin wing grid: dark back with pale shoulder patches; pale belly with dark wing edges and spots.
    - Cephalic fins, eyes, gill slits and a whip tail.
    - Wings beat in a travelling wave; amplitude and rate follow `agent.effort`, so it glides between bursts. One draw call per ray.
  - **Sea Turtle** (`SeaTurtle.tsx`, 24, `orientation: 'full'`):
    - Shell scutes are procedural vertex colours (vertebral, costal and marginal plates with seams).
    - Paddle-shaped flippers (`paddle()`). The front pair rows with a fast downstroke and a feathered recovery; the rear pair steers with `agent.bend`.
    - The head turns into curves.
- **New decorations** (`builders/legends.ts`, FX in `LegendsFx.tsx` merged into the `DecorationVisual` FX lookup):
  - **Sunken City Gate** (`citygate`, 21): carved pillars and runes, arch, keystone, toppled column, rubble, coral. FX: a teal portal haze plus glints.
  - **Glow Cave** (`glowcave`, 23): an arch tunnel of noise-rock boulders with crystals pointing inward, plus clusters at the mouths. FX: halos that bloom at night.
  - **Atlantis Palace** (`atlantis`, 25, +45% coin bubbles): two-tier marble platform, colonnade, windowed drum, gold dome with ribs, two towers. FX: a bobbing orb with orbiting sparkles, halo and glints.
  - **Giant Geode** (`geode`, 28): a lumpy back-half shell, an inside-out hollow lined with about 46 inward crystals, an agate-banded cut face, loose shards. FX: a halo at its heart plus glints.
- **Cost:** three creatures plus the four decorations together add about 47 draw calls (shadow passes included) and 79k triangles. Frame time stayed under 2 ms on desktop.
- **QA helper:** `fishQA.pump(frames)` advances the non-tank canvases (shop thumbnails) by hand while the pane is hidden. Await a MessageChannel tick between frames, since timers are throttled.
- **New sand:** Pink Pearl Sand (27) and Treasure Sand (29, glows).
- **Level-up dialog:** now also lists stands.

### Rare colour morphs (`src/state/morphs.ts`)

- **The morphs:** Golden 4%, Pearl 4%, Midnight 3%, Aurora 1.5% (glows). They are rolled per egg in `createNurseryEgg`.
- **Morph parents:** a morph parent multiplies the chance by 2.5, and 60% of those rare eggs copy the parent's morph.
- **Storage:** stored as `inheritance.morph`. `inheritedDefinition` wears the morph palette over the inherited base palette. Eggs inherit the base palette, not the morph colours.
- **Display:** fish cards and the fish pop-up show "Golden Clownfish" plus a "rare morph" tag.

### Fishpedia (`src/state/fishpedia.ts`, `src/ui/Fishpedia.tsx`)

- **Opening it:** the 📖 button in the top bar (with a "new" badge). Tapping a species name in the fish pop-up opens its page.
- **Overview:** species, nursery-stamp and morph totals; milestone chips (5/10/15/20/25/30/all → coins); rarity sections of cards that stay silhouettes until found; filters.
- **Species page:** big thumbnail, facts, a 4-morph gallery (thumbnails rendered on demand via `usePreviewStore.requestPreviews`), prev/next arrows.
- **Rewards** (`noteFish` in the store, called from `buyFish` and from nursery hatching):
  - first of a species: XP by rarity;
  - first hatch: a nursery stamp plus coins;
  - each morph: +200 coins and 50 XP;
  - milestones: coins.
- **Saves:** save version 6. `sanitize` keeps valid book entries and fills them in from owned fish, so old saves get credit for what they already have, with no retroactive rewards.
- **Tests:** 37 pass, including late-game coverage, morph rolls and Fishpedia persistence.

### Follow-up: fair feeding (hungry fish first)

Slow new species (octopus, sea turtle, starry pleco; all max speed 0.35) got zero meals in a mixed tank: fast fish cleared each pinch first, and one big fish could eat a whole pinch in a second. Changes in `useFishBrain.ts`:

- **Mostly full fish hang back.** At hunger 0.25 or below (at least 75% full), `lingerFor` makes a fish ignore fresh food for 1–1.6 s (longer when fuller). It also won't snap up a piece another fish has claimed.
- **Hungry fish push in.** Chase speed is `1.45 + hunger*1.2` (was `1.6 + 0.9h`). The crowd penalty in `pickFood` scales with fullness, so hungry fish barge into a crowd and full ones look for a piece nobody wants.
- **Swallow pause.** After each bite there is a pause (`0.45 + nutrition*1.5` s, about 0.75 s for a pellet) before the next. Jellies too.
- **Bite point per creature (`biteFor`).**
  - Turtle: the beak, 0.46 L ahead.
  - Manta: the mouth, 0.17 L ahead.
  - Octopus: arm reach, 0.55 L, centred a little low.
  - Other fish keep the old radius from the body centre.
  - Chasing steers the mouth, not the body centre, onto the food.
- **Visuals.** Crumb sparks come from the food. The turtle's neck stretches toward food and snaps forward on a bite.

QA: open `tests/fish.html?roster=octopus:2,sea-turtle:1` (this takes any `id:count` list), and the page exposes `fishQA.dropFood`.
- **Hunger test.** The mostly-full fish were at hunger 0.2 and the six big new species at 0.75, with three pinches per round. The hungry fish got 13–21 pieces per round; the mostly-full fish got 0–2.
- **Feeding to full.** All 24 fish ended full, the slow ones about 30 s after the fast ones. Only 4 pellets rotted.

### Next

- Playtest the late creatures on a real iPad: manta size at full growth, octopus arm reach on uneven gravel, turtle flipper clipping near the glass. The manta thumbnail is small because of its wide wingspan; a custom preview angle would help.
- Ideas: daily goals, hermit crab, a "new" dot on Shop after a level-up.

## Previous pass (Claude): performance evaluation and the dock UI

### Follow-up: soft jellyfish turns

The whole jelly (bell and tentacles) used to rotate as one rigid piece.

- **Tentacles hang on a spring.** `useFishBrain` (jelly branch) keeps a world-space direction the tentacles hang toward. It is gravity plus streaming back against the velocity, sprung so it overshoots slightly and swings.
  - It is converted to bell-local space as `agent.trail`.
  - `Jellyfish.tsx` turns that into `uBend` (xz direction + angle).
- **The strand shader bends each strand along a curve.** The tangent eases from the bell axis at the rim toward the hang angle, integrated with Simpson's rule so strand length is kept. Long tentacles and oral arms bend fully; the short fringe bends partway.
- **Tips lag the spin.** The slow spin about the bell axis now wanders. The tentacle tips lag it through `agent.twist`.
- **Steering happens in strokes.** The bell turns mostly while squeezing. The squeeze is lopsided toward the turn (`agent.steer` → `uSteer`), and the skirt drags after the turn.
- **Previews:** shop previews drift their tentacles in a slow circle.
- **Hot reload:** after HMR, existing jellies keep their old `jelly` ref; reload the page once.

### Performance

**How it was measured:** `/tests/fish.html?perf` is a busy late-game tank: 30 creatures (10 jellies), 16 decorations including 4 gadgets, a lighthouse and a stand. `fishQA.perf(frames)` reports:
- CPU time, split into scene update and render submission;
- draw calls and triangles per frame;
- GPU time (`EXT_disjoint_timer_query_webgl2`, sampled);
- heap growth.

**Before:**
- **Draw calls:** 707 per frame.
  - Finned fish were about 14 meshes each: 6 eye spheres, plus an invisible click sphere (`colorWrite:false`) that still cost a draw.
  - The axolotl alone was 50 meshes (every gill feather separate).
  - 97 shadow casters (179k tris) were drawn again into a 2048² shadow map every frame.
- **Triangles:** 672k.
- **CPU:** 4.1–4.5 ms per frame on the dev desktop.
- **Post-processing:** about 20 render passes per frame (mipmap bloom, vignette, tone mapping, SMAA).
- **Canvas:** `preserveDrawingBuffer: true`, which is expensive on tiled mobile GPUs.
- **Pixel ratio:** fixed `[1, 1.75]` with post-processing, which is fill-rate heavy on a big iPad.
- **HUD:** re-rendered once a second, because the top-level component subscribed to `fishVitals` and `currency`.

**After:** 486 draw calls (−31%), 567k tris, about 3.6 ms CPU. Scene update is about 0.25 ms; almost everything else is render submission.

**Changes:**
- **Eyes:** `fish/FishEyes.tsx` draws every live fish's eyes as 3 instanced meshes for the whole tank. Each `FishBody` registers an `EyeRig`, and pupil gaze offsets are written into it. Static shop previews still draw their own eye meshes.
- **Merged meshes:** puffer spikes are one instanced mesh, rebuilt only when the puff changes. Lionfish spines and whiskers are baked into one mesh each. Axolotl gills are one mesh per gill.
- **Click spheres** (`CreatureOverlay`) are `visible={false}`. R3F still raycasts them, and taps were verified.
- **`scene/RenderBudget.tsx`:**
  - `PhotoCapture` grabs the frame right after post-processing draws it (`useFrame` priority 10), so `preserveDrawingBuffer` is off.
  - `ShadowThrottle` refreshes the shadow map every other frame. It uses a frame counter because three.js clears `needsUpdate` itself.
  - `useAdaptiveDpr` uses drei `PerformanceMonitor`: it starts at min(device, 1.5), steps down by 0.25 when the frame rate struggles, and can climb back to 1.75.
- **HUD subscriptions** now select primitives: whole coins, a count of hungry fish, and per-row values in the fish list.

**Not done:**
- Bloom levels and SMAA are unchanged (GPU about 1–3 ms per frame here).
- The bundle is still about 1.72 MB (527 KB gzip).
- Other remaining draw calls: about 6 per fish (body, tail, dorsal, anal, 2 pectorals); decorations about 5 each (merged per material); a 20-mesh group of 12-triangle sprites/planes (likely god rays/popups) that could be merged.

### UI: the dock

This rebuild follows the player's sketch.
- **Dock:** each bottom button opens its own drawer, which slides up above the bar like a folder tab.
  - The active button fuses into the drawer, with CSS concave fillets.
  - Tap the active button, or the drawer's **Hide**, to tuck the drawer away.
  - Badges on the buttons show how many fish are hungry (Feed) and an alert when the tank needs cleaning (Clean).
- **Camera framing:** `CameraRig.keepTankInView` uses `camera.setViewOffset` and zoom (min 0.72). When a drawer covers the bottom of the screen, the tank slides up and shrinks to stay fully visible. `ui/screenInsets.ts` is written by `ResizeObserver`s in the Dock and TopBar.
- **Drawers** (`ui/dock/drawers.tsx`):
  - **Watch:** fish cards (tap to follow; move to the nursery). In the nursery it shows the friendship form, egg watch and the little fish.
  - **Feed:** food tiles; an empty treat links to the shop.
  - **Clean:** algae, murk and waste bars; owned glass and gravel tools as tiles (tapping one equips it and switches tools); Look around; Water change.
  - **Decorate:** thumbnail grid with gadget badges. Once an item is placed, the drawer shrinks to Rotate / Remove / Done, and it hides while dragging.
  - **Shop:** category chips and a compact card grid. The shop is no longer a modal; the tank stays visible and new fish appear live.
- **Top bar:** editable aquarium name, Aquarium/Nursery switch (with an egg count), a coin pill (hops on change), a level ring, and day/night, sound and photo buttons.
- **Left side:** tank-health gauges (hungry, algae, murk, waste) as rings; each jumps straight to the fix.
- **Other:**
  - The fish card, toasts and level-up/welcome modals are restyled; level-up can jump to the shop.
  - Font: Nunito (Google Fonts link in `index.html`, falls back to system fonts).
  - Reduced-motion is respected.
- **UI store:** `dock`, `trayOpen`, `openDock(tab)`, `setTrayOpen`, `openShop(tab?)`. `setMode` keeps `dock` in sync.
- **Removed:** `ShopPanel.tsx`, `InventoryPanel.tsx`, `SaveIndicator.tsx`, `ModeToggle.tsx`. The "saves automatically" note now sits in the Watch drawer.
- **`global.css`** was rewritten from scratch (tokens, components, two breakpoints at 760 and 520 px), replacing the accumulated per-viewport patches.
- **Checked in the browser:**
  - desktop 1004×914: Watch, Decorate, Shop, Clean and the nursery;
  - iPad portrait 768×1024: Watch with the fish card;
  - phone 375×812: Feed.
- **Verified:**
  - photo capture returns a real 1004×914 image;
  - fish taps still select;
  - no console errors;
  - typecheck, lint, 34 tests and the build pass.

### Next UI ideas

- Swipe down on a drawer to hide it.
- Long-press a dock button for a quick action (for example, drop a pinch of the last food).
- A "new!" dot on Shop when a level-up unlocks items.
- Keyboard shortcuts (1–5) for the dock.

## Previous pass (Claude): fish that feel alive, and feeding that works

The player reported, after about 2 hours of play (level 9, about 10 jellyfish), that fish movement felt lackluster and jellies almost static. Fish also rarely caught food before it hit the gravel; with the Auto-Feeder Lighthouse, often only one fish got a pellet.

**Why feeding failed.** Three causes:
- Every fish chased the single nearest pellet.
- Fish below 45% hunger only noticed food within about 3.5 units.
- Only bottom-zone fish could eat food that had settled.

The lighthouse made it worse: its pellets fell just 1.4 units from the lantern, about 3 s to the gravel.

**Feeding fixes:**
- `sim/food.ts`:
  - Each `FoodItem` has `claims`, the number of fish heading for it.
  - `predictFood(item, seconds)` estimates where a piece will be after floating, sinking, drift and fountain rise; it stops at the gravel.
  - `releaseFoodAt` gives pieces an upward `rise` that decays, so feeder pellets fountain up out of the lantern. Drift now decays too.
- `useFishBrain.ts`:
  - **Choosing food:** every fish over the hunger threshold notices food anywhere in the tank. It re-picks every 0.25–0.45 s by estimated time to intercept (leading falling food), plus 1.1 s per rival already heading for that piece. The current target gets a small bonus so fish don't flip-flop between pieces. This spreads fish across a cloud of pellets.
  - **Eating:** any reachable piece within mouth range is snapped up. All swimmers dive to pick pellets off the gravel; pellets inside a decoration's footprint are ignored.
  - **Chasing:** fish turn and accelerate harder, pitch more steeply, push each other apart less, and their vertical damping no longer depends on frame rate.
- `sim/autoFeeder.ts` + `sim/gadgets.ts` (`feederCall`): the lighthouse rings a dinner bell (`sfx.chime`, lantern blinks in `GadgetFx`) 2.6 s before releasing. Hungry fish gather in a ring around the lantern, and the release is 3–10 pellets depending on how many fish are over 22% hunger.
- **Feed mode:** hungry, non-bottom fish crowd up under the cursor near the surface, waiting for food.
- **Measured (QA fixture, 25 fish):** a lighthouse release of 10 pellets was entirely eaten within about 1.5 s. Five hand-dropped pinches (25 pellets) across the tank were all eaten within 10 s, including by 3 jellies.

**Fish movement (`useFishBrain.ts`, `FishBody.tsx`, `fishMaterials.ts`):**
- **Per-fish personality**, seeded by fish id: speed ±12%, glide length, preferred spot when gathering.
- **Burst-and-glide cruising:** a few tail beats, then a coast with the tail almost still. Big fish glide longer; tetras dart.
- **Hover pauses:** at about half of wander stops, the fish holds still with a gentle bob while its pectorals fan quickly.
- **Turns:** the body curls into them (new `uBend` shader uniform; the tail fin follows).
- **Breathing:** a subtle head/gill pulse.
- **Eyes:** pupils follow the target food, the lantern, or the camera (`agent.gaze`/`gazing`).
- **Tapping a fish to select it:** it does a happy shimmy and turns to look at the player (`agent.wiggle`, set in `CreatureOverlay`).

**Jellyfish rebuilt (`creatures/Jellyfish.tsx` + `locomotion: 'jelly'` in the brain):**
- **Pulse-and-glide propulsion:** a fast squeeze, then a slow relax. Each squeeze kicks along the bell's axis, and the bell tilts slowly toward its goal.
- **Depth control:** the squeeze rhythm always stays lively; depth comes from how strong each squeeze is, so jellies sink gently between soft pulses. An earlier version tied lift to pulse rate; that couldn't work because average thrust didn't depend on rate, and every jelly pinned itself to the surface.
- **Shader motion:**
  - The bell squeezes hardest at the rim, with a scalloped rim ripple.
  - The bell is denser and brighter at the edges, glowing a little with each squeeze.
  - Tentacle roots follow the rim; the squeeze reaches the tips a moment later.
  - A ripple runs down the tentacles each pulse, and they stream behind the motion (`agent.trail`).
- **New anatomy:** 36 short fringe tentacles, 8 long ones and 4 frilly oral arms, merged into one mesh. Each jelly is now 3 draw calls instead of 27 (it was about 270 for 10 jellies). Materials are per-jelly but share shader programs.
- **Feeding:** jellies catch food drifting through the tentacle curtain, draw nearby food in with each pulse, and steer to sit just above a target piece.

**Other creatures:**
- **Seahorse:** leans into travel and straightens when hovering; its back fin buzzes harder with effort.
- **Axolotl:** the body sways side to side with each step, the diagonal legs lift, and the gills ripple and breathe.
- Snail and shrimp are unchanged.

**Validation:**
- Typecheck, lint (`--quiet`) and the production build pass.
- 34 tests pass; the new one covers the feeder fountain and food prediction.
- A real-page load showed no console errors.

**QA fixture: `/tests/fish.html`.**
- In-memory state: 10 moon jellies, assorted fish and a placed lighthouse.
  - `?jellies` gives jellies only.
  - `?nofeeder` leaves the lighthouse out.
- **Stepping the frames by hand:** the Claude desktop browser pane reports `document.visibilityState === 'hidden'` when the window isn't in front, which throttles rAF to about 1 fps. `window.fishQA.step(seconds)` pins R3F's clock to 1/60 while it advances frames by hand, then restores the real clock.
  - It used to leave the clock pinned, so a visible page then advanced 1/60 s per frame. On a 144 Hz display everything ran about 2.5× fast. Fixed October 2.
  - Don't use R3F `frameloop: 'never'` + `advance(t)` for this: the throttled loop interleaves millisecond timestamps, which produces large negative deltas.
- `fishQA.r3f()` returns the R3F state (camera, gl, scene). This is handy for patching `gl.render` to use a close-up camera.
- `fishQA.follow('jellyfish', i)` turns on the camera follow.
- Screenshots in the hidden pane only refresh after an input event (a scroll works).

**Ideas for next passes** (from examining the game; none are implemented):
- **Fish personality in the info panel** ("Bold", "Shy", "Glutton"), derived from the same per-fish seed so it matches how the fish actually moves.
- **Night behaviour:** fish settle near the gravel or inside caves/castles, corys rest under plants, jellies glow and drift.
- **Fish-to-fish play:** occasional chases between same-species fish, a courtship dance before a nursery pairing, clownfish hiding in the anemone when startled.
- **Hand-feeding:** hold a treat at the glass and the fish nibble from it, plus a Happiness meter fed by variety, cleanliness and attention.
- **Daily goals and achievements** (feed 3 times, clean the glass, collect 10 coin bubbles) for a reason to return. Also a party treat and the octopus idea from before.
- **Performance:**
  - Each finned fish is about 12 meshes; instancing eyes or merging fins would help at 30 fish.
  - The bundle is about 1.7 MB minified; code-split the shop previews, the stands and the nursery.
- **Accessibility:** a reduced-motion toggle and colour-blind-safe status icons.

## Previous pass: iPad Safari menu and Home Screen support

- User reported the bottom menu was completely clipped on iPad Safari. `.game-root` previously used `100vh`, which measures the large viewport including space behind mobile browser controls. It now uses `100dvh` with a `100%` fallback through the existing full-height root chain. The canvas and HUD resize together with visible browser space and orientation changes.
- Bottom toolbar, feed/clean panels, decoration palette, compact nursery and save indicator share `--safe-bottom: env(safe-area-inset-bottom, 0px)` so any supplied home-indicator inset preserves their spacing. Safari's automatic safe viewport and default standalone status bar are retained; no edge-to-edge `viewport-fit=cover` is requested.
- Added `public/manifest.webmanifest` with relative `id`, `start_url`, `scope` and icons, `display: standalone`, aquarium name/theme, and 192/512 PNGs. `index.html` links a 180px Apple touch icon and adds legacy Apple standalone/title/status-bar metadata. An original vector goldfish icon replaces the generic build-tool favicon; PNG variants match `public/app-icon.svg`.
- On iPad: reload the public site, choose Share → Add to Home Screen, keep **Open as Web App** enabled if shown, then launch the new icon. Home Screen mode needs an internet connection to launch; no offline cache/service worker or cloud save sync was added. Safari and installed web-app storage can be separate, so do not promise automatic save transfer or recommend deleting an installed app with progress.
- Verification: build/typecheck, lint and 33 gameplay tests pass. In a Chromium browser, all five bottom buttons were fully visible and unobstructed at 768×1024, 768×900, 1024×768, 1024×620, 820×1060, 1180×700, 320×568, 390×700 and 1440×900. Actual clicks switched Watch/Feed/Clean/Decorate and opened Shop at 1024×620; no runtime errors. These are viewport checks, not physical iPad Safari emulation of browser chrome or installed-app mode. Manifest paths resolve within `/AquariumGame/`; all three PNG dimensions and built relative links were checked.

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
