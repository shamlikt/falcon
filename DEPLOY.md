# Team Falcon: deployment runbook

This file is written for an agent (or a person) who has to deploy the site or ship a change to it.
Every step names the command to run and the output that means it worked.
Run commands from the repo root (`/home/shamlik/aiwork/random/falcon`) unless a step says otherwise.

## 1. What is being deployed

The site is static.
The folder `builds/falcon/` is served as-is; there is no bundler and no build step for the page itself.

| Piece | Path | Notes |
|---|---|---|
| Page | `builds/falcon/index.html` | One page for all 16 players, routed by `?player=<slug>` |
| Redirect stub | `builds/falcon/roster.html` | Old links; forwards to `index.html` keeping the query |
| Data | `builds/falcon/players.js` | The only copy of names, numbers, events and captions |
| Page script | `builds/falcon/roster.js` | Routing, figure loading, dossier, picker |
| Renderer | `builds/falcon/splat.js` | WebGL2 Gaussian-splat renderer |
| Engine | `builds/falcon/scrollcraft.js`, `scrollcraft.css` | Scroll engine from the scroll-craft skill; never edited |
| Styles | `builds/falcon/falcon.css`, `roster.css` | Tokens, sections, picker |
| Figures | `builds/falcon/assets/*.splat` | One per captured player plus `avatar.splat` (the default) |
| Manifest | `builds/falcon/assets/figures.json` | Maps player slug to figure file and content hash; generated |
| Posters | `builds/falcon/assets/poster-*.png` | No-WebGL fallback image of the default figure; generated |

Not deployed: `builds/falcon/node_modules/`, `builds/falcon/lab/` (QA scripts and screenshots), `package.json`, `package-lock.json`, and the raw `*.ply` captures in the repo root (git-ignored, 40 to 50 MB each).
The deployable folder is about 35 MB, almost all of it the `.splat` files.

Runtime requirements for visitors: a browser with WebGL2 (the page falls back to the poster image without it) and access to Google Fonts (system fonts are declared as fallbacks).

Hosting target: GitHub Pages, project site, published by `.github/workflows/deploy.yml` on every push to `main`.
Live URL once enabled: https://shamlikt.github.io/falcon/
The repository `shamlikt/falcon` is public, so Pages is available on the free plan.

## 2. Prerequisites on the build machine

- Node 22 or newer (`node --version`).
- Git with push access to `git@github.com:shamlikt/falcon.git` over SSH (`git remote -v` shows `origin`).
- For the QA scripts only: `playwright-core` and a Chromium.
  Install once with `cd builds/falcon && npm install && npx playwright-core install chromium`.
  On this machine the browser lives at `/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`.
  Export it as `SCROLLCRAFT_CHROME` before running any QA script.
- The local static server is the scroll-craft skill's `serve.mjs`:
  `/home/shamlik/.claude/plugins/cache/nateherk/nateherk-design/0.3.0/skills/scroll-craft/scripts/serve.mjs`.
  Any static server works; this one sends `no-store` so QA never sees a cached file.
- No ffmpeg is needed.
- Headless WebGL on this machine is software-rendered (SwiftShader).
  The page detects it and draws a 70,000-splat budget; that is expected in screenshots taken here.
  Never run two headless browser chains at the same time; they starve each other and time out.

## 3. Pre-deploy checks

Run all of these before every push that changes the site.

1. Validate the roster data.

   ```bash
   node tools/check-roster.mjs
   ```

   Expected: `16 players, 48 captions, 0 failure(s), 0 warning(s)`.
   A non-zero exit lists exactly what is wrong (a name not on the poster, a duplicate number or caption, a caption that never names its event).

2. Make sure the figure manifest is current and idempotent.

   ```bash
   node tools/build-figures.mjs
   node tools/build-figures.mjs
   ```

   Expected on the second run: `up to date` for every `.ply` and `unchanged   assets/figures.json`.
   If the first run printed `converted` or `wrote`, those files must be committed.
   Read the `warn:` lines: `matches no player` means a PLY file name does not match anyone in `players.js`; `framed differently` means look at that player's landing screenshot in the next step.

3. Serve the site locally.

   ```bash
   node /home/shamlik/.claude/plugins/cache/nateherk/nateherk-design/0.3.0/skills/scroll-craft/scripts/serve.mjs --root builds/falcon --port 4500 &
   curl -s http://localhost:4500/ | grep -o '<title>.*</title>'
   ```

   Expected: `<title>Team Falcon</title>`.
   If the port is taken, confirm it is this site before trusting any check; a stale server on 4500 will make every check pass against the wrong page.

4. Run the end-to-end checks.

   ```bash
   cd builds/falcon
   SCROLLCRAFT_CHROME=/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node lab/roster_e2e.mjs
   cd ../..
   ```

   Expected last line: `50 checks, 0 failure(s). Screenshots in lab/roster/`.
   It covers the default player, deep links, the placeholder path, unknown slugs, picker clicks, back and forward, hash anchors, card order, horizontal overflow, the no-WebGL fallback, and a framing screenshot of every captured figure at desktop and phone size.
   Open `builds/falcon/lab/roster/desktop_<slug>.png` for any new or changed figure and confirm the head is upright, facing left of centre, and not clipped.

5. Optional, after layout or copy changes: the scroll harness for dead scroll and text contrast.

   ```bash
   cd builds/falcon
   SK=/home/shamlik/.claude/plugins/cache/nateherk/nateherk-design/0.3.0/skills/scroll-craft/scripts
   node $SK/shoot.mjs --url http://localhost:4500 --out lab/shots
   node $SK/shoot.mjs --url http://localhost:4500 --out lab/mobile --width 390 --height 844
   node lab/sheet.mjs lab/shots 7 && node lab/sheet.mjs lab/mobile 9
   cd ../..
   ```

   Expected in each log: `no dead scroll detected` and `contrast over media: all cues clear 4.5:1 at their worst frame`.
   The only acceptable `FAILED REQUESTS` entry is `net::ERR_ABORTED` on a `.splat` URL; that is the page stopping a download once its splat budget is reached.
   Read `lab/shots/sheet.png` and `lab/mobile/sheet.png` by eye.

6. Confirm the working tree only contains the change you intend.

   ```bash
   git status --short
   ```

   `.ply` files never appear here; they are ignored on purpose.

## 4. First-time setup of GitHub Pages

Do this once.
As of the last check the repository had Pages disabled (`has_pages: false`).

1. Enable Pages with GitHub Actions as the source.
   In the browser: repository Settings, then Pages, then under Build and deployment set Source to GitHub Actions.
   From a shell with a personal access token that has the `repo` scope:

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
     https://api.github.com/repos/shamlikt/falcon/pages -d '{"build_type":"workflow"}'
   ```

   Expected: HTTP 201 and a JSON body with `"build_type": "workflow"`.
   A 409 means it is already enabled.

2. Commit and push the workflow.

   ```bash
   git add .github/workflows/deploy.yml DEPLOY.md
   git commit -m "Deploy to GitHub Pages from main"
   git push
   ```

3. Watch the first run.
   In the browser: the Actions tab, workflow "Deploy Team Falcon to GitHub Pages".
   From a shell (no token needed on a public repo):

   ```bash
   curl -s "https://api.github.com/repos/shamlikt/falcon/actions/runs?per_page=1" | python3 -c "import sys,json; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['name'], r['status'], r['conclusion'], r['html_url'])"
   ```

   Expected: `completed success`.
   The build job runs `check-roster.mjs`, re-indexes the committed figures and fails if `figures.json` is stale, stages the folder without dev files, and uploads it; the deploy job publishes it.

4. Confirm the URL answers (section 6).

## 5. Deploying a change

Every push to `main` deploys.

```bash
git add -A            # .ply files stay ignored
git commit -m "<what changed>"
git push
```

Then wait for the workflow (one to two minutes) and run the post-deploy checks in section 6.
To redeploy without a code change, open the workflow in the Actions tab and use "Run workflow" (the `workflow_dispatch` trigger).

## 6. Post-deploy verification

```bash
LIVE=https://shamlikt.github.io/falcon/
curl -sI "$LIVE" | head -1
curl -sI "${LIVE}assets/figures.json" | grep -i -E "^HTTP|content-type"
curl -sI "${LIVE}assets/avatar.splat" | grep -i -E "^HTTP|content-length|accept-ranges"
```

Expected: three `HTTP/2 200` lines; `figures.json` served as JSON; the splat with a content length of a few megabytes.
`accept-ranges: bytes` is preferred (phones then download only their splat budget) but not required; without it the page cancels the download once it has enough.

Then run the same end-to-end suite against the live site:

```bash
cd builds/falcon
ROSTER_URL=https://shamlikt.github.io/falcon/ SCROLLCRAFT_CHROME=/home/shamlik/snap/alacritty/common/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node lab/roster_e2e.mjs
cd ../..
```

Expected: `0 failure(s)`.
Finally open the live URL in a real browser, scroll the landing figure through the respawn, open two players from the picker, use the back button, and open one `?player=<slug>` link directly.

## 7. Routine: add a player's 3D capture

1. Copy the capture to the repo root, named after the player: `<Name>.ply`.
   Matching ignores case, spaces and punctuation, so `Nabeela Abdul` matches `NabeelaAbdul.ply`, `nabeela_abdul.ply` or `nabeelaabdul.ply`.
   The name must be one of the 16 in `players.js`.
2. Build.

   ```bash
   node tools/build-figures.mjs
   ```

   Expected: a `converted   <Name>.ply -> assets/<slug>.splat` line, `wrote       assets/figures.json`, and the player listed with `figure assets/<slug>.splat`.
   A `matches no player` warning means the file name is wrong; rename the file and rerun.
3. Run the checks in section 3 (steps 1 to 4) and look at `lab/roster/desktop_<slug>.png` and `lab/roster/phone_<slug>.png`.
   If the figure is sideways, tiny or clipped, add a `frame` override to that player in `players.js`, for example `frame: { distScale: 1.15 }` or `frame: { up: [0, 1, 0] }`, and rerun.
4. Commit only the derived files.

   ```bash
   git add builds/falcon/assets/<slug>.splat builds/falcon/assets/figures.json
   git commit -m "Add <Name> figure"
   git push
   ```

   The player moves from the placeholder group to the captured group in the picker automatically.
   Never commit the `.ply`.

## 8. Routine: replace the default figure

1. Replace `gaussians.ply` in the repo root.
2. Rebuild and re-render the fallback posters (the local server must be running, section 3 step 3).

   ```bash
   node tools/build-figures.mjs
   cd builds/falcon && SCROLLCRAFT_CHROME=<chrome> node lab/poster.mjs && cd ../..
   ```

   Expected: `converted   gaussians.ply -> assets/avatar.splat`, then `wrote assets/poster-desktop.png` and `wrote assets/poster-mobile.png`.
3. Check one placeholder player, for example `http://localhost:4500/?player=lifin`, then commit `avatar.splat`, `figures.json` and both posters, and push.

## 9. Routine: change names, numbers, events or captions

1. Edit `builds/falcon/players.js` only.
   Keep exactly three lines per player labelled Callsign, Doctrine and Verdict, keep every line unique, and make at least one line mention the player's event.
   The order of `PEOPLE` is the display order inside each group (captured first, then placeholders).
2. Run `node tools/check-roster.mjs`, then the end-to-end suite, then commit and push.
   Renaming a player changes their slug, so rename their `.ply` and rebuild figures in the same change.

## 10. Rollback

- Revert the bad commit and push; the workflow redeploys the previous state.

  ```bash
  git revert <sha>
  git push
  ```

- Or open the last good run in the Actions tab and choose "Re-run all jobs"; it rebuilds and publishes that commit.

## 11. Any other static host

The site needs nothing but files.
Copy `builds/falcon/` without `node_modules`, `lab`, `package.json` and `package-lock.json`.
Serve `.splat` files as `application/octet-stream` (unknown-extension default on most hosts) and allow HTTP range requests if you can.
Cache `assets/*.splat` for as long as you like; their URLs carry a content hash (`?v=`), so a changed figure is a new URL.
Do not cache `index.html`, `assets/figures.json`, `players.js` or `roster.js` for long; the page fetches the manifest with `cache: 'no-cache'`, but the HTML and scripts rely on the host.
Example for S3 with CloudFront:

```bash
aws s3 sync builds/falcon s3://<bucket>/ --delete \
  --exclude 'node_modules/*' --exclude 'lab/*' --exclude 'package.json' --exclude 'package-lock.json'
aws s3 cp s3://<bucket>/assets/ s3://<bucket>/assets/ --recursive --exclude '*' --include '*.splat' \
  --content-type application/octet-stream --metadata-directive REPLACE --cache-control 'public, max-age=31536000, immutable'
aws cloudfront create-invalidation --distribution-id <id> --paths '/index.html' '/assets/figures.json' '/*.js' '/*.css'
```

## 12. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Arena shows the still poster and the badge says nothing is loading | WebGL2 is unavailable in that browser; the poster fallback is working as designed. Check the console for `no-gl`. |
| A player shows the placeholder although their `.splat` exists | `figures.json` is stale or was not deployed. Run `node tools/build-figures.mjs`, commit the manifest, push. |
| `build-figures.mjs` warns `matches no player` | The PLY file name does not slug to a name in `players.js`. Rename the file. |
| New figure looks like the old one after deploying | The old `figures.json` is cached by the host. Hard-refresh; confirm the `?v=` hash in the network panel changed. |
| End-to-end run times out on `waitForFunction` | Another headless browser is running on this machine, or the server on 4500 is not this site. Kill the other run (not with `pkill -f` from the same shell) and restart the server. |
| Workflow fails at "figure manifest matches" | Someone committed a `.splat` without regenerating `figures.json`. Run the build script and commit the manifest. |
| Landing opens on a placeholder player | The default is the captain once his capture exists, otherwise the first captured player in `players.js` order. Check `DEFAULT_PLAYER` and the order. |
| Fonts look wrong | Google Fonts unreachable; the page falls back to system fonts. Nothing to fix on the site side. |

## 13. File map for maintainers

```
.github/workflows/deploy.yml   Pages deployment
DEPLOY.md                      this runbook
tools/ply2splat.mjs            PLY to .splat converter (CLI and module)
tools/build-figures.mjs        discovers *.ply, converts, writes assets/figures.json
tools/check-roster.mjs         validates players.js
builds/falcon/players.js       roster data (single source)
builds/falcon/roster.js        page behaviour
builds/falcon/splat.js         renderer
builds/falcon/lab/roster_e2e.mjs   end-to-end checks
builds/falcon/lab/poster.mjs       re-renders the no-WebGL posters
builds/falcon/lab/sheet.mjs        contact sheet from harness shots
builds/falcon/BRIEF.md         design brief of the original single-player page
FINGERPRINTS.md                scroll-craft build registry
```
