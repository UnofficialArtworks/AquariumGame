# My Aquarium

A browser aquarium game built with React, Three.js / React Three Fiber, TypeScript, and Zustand. Inspired by the relaxed, playful games on Flash-era arcade sites. All fish, scenery, effects, and sounds are generated in code.

## Run locally

```sh
npm install
npm run dev
```

Open the URL Vite prints. Progress saves automatically in that browser and origin.

```sh
npm run typecheck  # Checks the referenced app and Vite TypeScript projects
npm test          # Node regression tests, compiled using the existing Vite toolchain
npm run lint      # Oxlint (existing scene animation warnings remain)
npm run build     # Static production site in dist/
npm run preview   # Preview the production build
```

## Playing

- **Watch:** drag to orbit, scroll to zoom, tap a fish to inspect it, or use the Fish list. Rename fish and your aquarium, follow a fish, transfer it, or sell it.
- **Feed:** choose free pellets/flakes or a special treat, then tap the water. Hungry fish swim to food and eat it. Meals increase growth; leftovers eventually dirty the main tank.
- **Clean:** drag a glass tool over algae, including the bottom strip and corner seams. The HUD disappears during the stroke so it cannot block your cleaning. Right-drag to orbit, or enable **Move camera** for touch/left-drag orbit. Cleaning mode allows a full turn around the tank to reach all four walls. Select the sponge again to resume. Vacuum waste from the gravel or change murky water. Upgraded tools unlock in the shop.
- **Decorate:** place unlocked decorations, drag them around the tank, rotate, or remove them. The compact palette collapses when selecting or dragging an item; choose another to reopen it. Gadget decorations give passive bonuses while placed.
- **Shop:** browse fish, decorations, treats, tools, backgrounds, gravel and stands. Every category is ordered by unlock level, then price. Items unlock as you gain levels; gifted starter treats can be used before their shop unlock.
- **Nursery:** move fish using the Fish list or their info card. Any two fully grown fish, including different species, can become **Bubble Buddies**. Start a two-minute friendship round to welcome a clutch of 1–6 eggs. The first friend's species determines the egg-count range shown in the panel. Each egg has its own random species hatch time; the count and countdowns save and continue while away. Hatchlings take their body shape from one parent and colors from the other, start visibly small, and can immediately move to your aquarium. Both parents remain. The nursery holds 12 occupants including eggs and reserves every egg in an active clutch. It is automatically filtered; home aquarium cleanliness determines the sale bonus.
- **Raise and sell:** fish become more valuable as they grow, and a cleaner aquarium adds up to 25% to the sale value. Sales are the main income loop. Passive income is only one coin per 200 seconds, with occasional fish coin bubbles. Cleanup creatures slowly grow by grazing.
- Toggle day/night, sound, or save a PNG photo with the top controls.

## Current content

28 aquatic creatures, 35 decorations, eight backgrounds, six substrates, seven cleaning tools, nine stands, free staple food and six special treats. Features include growth, permanent individual size variation, hunger, schooling, animated plants, procedural caustics, algae, food decay, cleaning, coin bubbles, offline progress, and level rewards. Save version 5 migrates existing version 1–4 aquariums, including renamed species and previously owned backgrounds.

## Development notes

Frame-by-frame simulation lives in `src/sim/`; persistent gameplay lives in `src/state/`. Economy and visible growth size are configured in `src/state/economy.ts`; individual size and egg-count ranges live in `fishDefinitions.ts`; species hatch ranges and inherited traits live in `src/state/nursery.ts`. Nursery and home fish/food are separate. Only the visible tank runs fish movement; vitals, friendship and egg timers advance for both tanks, with bounded offline catch-up.

Postprocessing uses a single-sample HDR buffer with SMAA. Multisampled postprocessing produced an almost black tank in the tested Windows WebGL browser. Bloom and neutral tone mapping remain enabled.

For manual nursery QA, open `/tests/nursery.html` on a separate development-server port. It supplies two grown fish of different species plus two eggs and keeps game mutations in memory. This test entry is excluded from the production build. Use the normal root page to play and save progress.

`/tests/visual.html` supplies six eggs, two adult goldfish at their size-range endpoints, all decorations and backgrounds, and a frame monitor cycling through the eight backdrops. Use a separate port to isolate its algae save from player progress. This fixture also stays out of production.

## Hosting

Play the deployed game at [My Aquarium](https://unofficialartworks.github.io/AquariumGame/). The source lives in [UnofficialArtworks/AquariumGame](https://github.com/UnofficialArtworks/AquariumGame), and pushes to `main` automatically update the site after checks pass.

On iPad, reload the site in Safari, choose **Share → Add to Home Screen**, and leave **Open as Web App** enabled if Safari shows that option. Launch the aquarium icon to play in its own window without Safari's address bar. The layout follows the visible browser height in portrait and landscape. Internet access is needed to launch; Home Screen and Safari saves may be separate, and there is no cloud sync.

GitHub Pages deployment is configured in `.github/workflows/pages.yml`. To publish a separate copy:

1. Create your public GitHub repository and push this project, including `.github/workflows/pages.yml` and `package-lock.json`.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**. No additional starter workflow is needed.
3. The workflow runs on pushes to the repository's default branch (whether `main`, `master`, or another name). If the initial run preceded enabling Pages, open **Actions → Check and deploy aquarium → Run workflow** and choose the default branch.
4. Open the site URL shown in the deployment job or in Settings → Pages.

The workflow uses Node.js 24, installs locked dependencies, checks lint/types/tests and high-severity dependency advisories, builds the game, and publishes only `dist/`. Pull requests run the checks without deploying. Vite's relative `base: './'` supports a repository subdirectory URL without editing the repository name into the configuration. GitHub supplies the deployment token; no personal token is needed in the workflow.

Later pushes to the default branch update the live game. To roll back, revert the faulty change and push to that branch. The previous site stays live if the build checks fail. Progress belongs to each browser and origin; localhost saves do not automatically transfer to the public site.

The contents of `dist/` can also be hosted on another static web host. There is no backend, account system, or real-money economy.
