# Falcon: brief

> **Superseded (2026-09-05).** The single-player Kabeer page this brief describes became the Team Falcon roster: `index.html` now opens one of sixteen players (URL `?player=<slug>`), figures are discovered from `<Name>.ply` files by `tools/build-figures.mjs`, and player data lives in `players.js`. The arena, dossier, respawn and close below are the grammar the roster still runs on.

**Self-authored, not interviewed.**
The run was autonomous and the user was not reachable for questions.
Everything marked *evidence* comes verbatim from the one request the user typed.
Everything marked *authored* is a decision made in the brand's voice to fill the gaps, and the report names each one.

The request, verbatim:

> i need to create a scrollabe website for my game team called Falcon, there should be a falcon like very game theamed font and i am showing charector avathar @gaussians.ply , it nee to rotate while scorlling down and One name Should game in the kabeer, and few random inromaiton, it should very intresting website, if we scoll down it will rotate, website should very interactive

Reading of the one ambiguous line, "One name Should game in the kabeer": taken as *one name should come in, Kabeer*.
Kabeer is the name of the player whose avatar this is, and it appears prominently as the avatar's nameplate and at the peak.
If Kabeer is instead meant to be a second team name or something else, only the nameplate copy changes.

---

## The eight topics

### 1. Vibe, and references

*Evidence:* "very game themed", "very interesting", "very interactive", "falcon like".
*Authored:* **Arena, predator, respawn, tactile.**
References from other media, not sites: the character-select turntable in a fighting game, the pre-match lobby of a tactical shooter where your operator stands in a dark hangar while the roster fills in, and a nature documentary's slow-motion stoop of a peregrine.

### 2. The scroll journey, section by section

*Evidence:* the avatar is shown first and rotates as you scroll down; a name (Kabeer) comes in; then "a few random information".
*Authored sequence:*

1. Land in the arena. FALCON at wall size, Kabeer standing in front of it.
2. Circle him. Scroll turns him, and his dossier lines arrive while he turns: callsign, role, how he plays.
3. Respawn. He bursts into a swarm of sparks, hangs there for a beat, and re-forms facing you, with KABEER stamped across the screen.
4. The Falcon way. What the team stands for, in a few short rules, and a few facts about the squad.
5. The squad. The roster, one card per player, on a rail.
6. Join. Type a callsign, see yourself on a Falcon nameplate, and take the one action.

### 3. The energy curve

*Authored:* Medium open (the arena is already alive), building through the turn, a hard drop to near-silence while the swarm hangs, the loudest moment on the snap back, then a deliberate step down to a readable, dense middle, a lateral lift for the roster, and a firm, quiet close.

### 4. Feeling by stage, and the one moment

*Authored.* The feeling curve is its own section below.
The one moment they remember: **the swarm snapping back into Kabeer, facing them, with his name across the screen.**

### 5. The one thing no other site does

*Evidence:* "it needs to rotate while scrolling down".
*Authored, pushed one step further:* scrolling does not only turn the character. Past the turn it **disassembles him into a swarm of glowing splats and re-assembles him facing you**, and the swarm's spin follows the speed of your hand.
The character is a Gaussian splat, so every one of its ~200,000 splats is a particle that can be sent flying and called back. No image or video could do this.

### 6. Distance from premium-minimal

*Evidence:* "very game themed".
*Authored:* **Playful-maximalist gaming HUD**, held on the taste floor.
Big angular display type, a HUD compass dial that is also a control, hard section grounds, one amber accent doing real work.
Not charcoal-with-one-accent minimalism, and not neon-purple gamer default either.

### 7. One unbroken world, or distinct scenes?

*Authored:* **One fixed subject with the document scrolling past it, then hard cuts.**
The arena and Kabeer are one continuous place for the first three beats (the stage never cuts, the character never leaves the frame).
From beat four the page becomes distinct scenes on their own grounds, which physically slide up over the arena and cover it.
Not worldflight: there is no film, there is a live 3D subject.

### 8. Assets already owned

*Evidence:* `gaussians.ply`, a 3D Gaussian Splatting capture of the character avatar (203,082 splats, SH degree 3, 48 MB).
Converted to `assets/avatar.splat` (6.5 MB, importance-sorted so a partial download already shows the body).
No logo, no palette, no photography, no brand kit.
**No KIE key is set, so nothing is generated.** The world is the splat plus procedural and CSS-drawn planes. That is a first-class route here, not a fallback.

---

## The journey (beats)

```
1  Arrival      the arena, FALCON wall-size, Kabeer in front of it, already turning under the hand
2  Circling     the dossier arrives while he turns: who he is, what he does
3  Respawn      he scatters into sparks, hangs, snaps back facing you: KABEER
4  Grounding    the Falcon way, a few rules and a few facts, on a hard new ground
5  Belonging    the squad on a rail, Kabeer first, four teammates after
6  Resolve      your callsign on a Falcon nameplate, one action, nothing else
```

## The feeling curve

One line per act: the emotion, then what on screen causes it.

```
1  Arrival        wall-size FALCON behind a life-size character who starts turning the moment the wheel moves
2  Curiosity      circling him; each dossier line lands on a different side as a new angle of him comes round
3  Awe            he comes apart into a swarm, the copy goes quiet, then the swarm snaps into him facing you and KABEER stamps
4  Grounding      a hard cut to a lit, readable ground: the rules, in plain type, no motion under them
5  Belonging      the roster pulled sideways, five faces of one squad, each with a role
6  Resolve        the page stops. A nameplate takes your callsign. One button. The falcon mark holds.
```

No two adjacent acts share a feeling. Act 3 is the peak and has the largest span on the page.
Act 4 is deliberately quieter than the acts either side of it so the peak has something to fall from and the rail has something to lift from.

## The peak

> "The character exploded into sparks when I scrolled, and then snapped back together looking right at me with his name across the screen."

Lives in act 3 (Respawn). It gets the largest span (3.4 viewport-heights), the best of the only real asset (the splat, at full count), and an authored silence in front of the snap.

## The tell-someone sentence

> It's the site where **the player blows apart into sparks under your scroll and reassembles facing you**.

## Authored silence

Act 3, progress 0.38 to 0.52: no copy is lit. The swarm hangs, spinning slowly with the scroll. This is intentional and the verification pass should read it as anticipation, not dead scroll.
The fixed stage publishes `data-sc-verify-state` (yaw, assembly, opacity) so the harness can see that the composition is changing during that window.

---

## Grammar: Turntable dossier (a new grammar)

Not one of the eight. Its structure is different enough to define, and its bans are what keep it different:

**What it is.** One live 3D subject on a fixed stage. The document scrolls past it in normal flow. The subject's orientation is a pure function of document position, so scrolling *is* turning it. After the subject's arc completes, the remaining sections rise over the stage on opaque grounds and cover it.

**Nav.** No wordmark-plus-CTA bar. A HUD: a compass dial fixed bottom-left showing the subject's current heading in degrees, which is also a scrubber (drag it and the page scrolls, because the heading is bound to scroll and there is one source of truth). A section index fixed bottom-right that jumps. The CTA is a single chip top-right.

**Hero.** The subject already present, life-size, with the wordmark at composition scale *behind* it so the subject occludes the type. Real `<h1>`. Copy anchored to a corner. Motion begins with the first notch.

**Sequence.** Subject acts first (flow markers over the fixed stage, then one pinned act for the peak), then hard-cut document sections on their own grounds. Grounds are painted per section, never drifted.

**Close.** A real input that renders something the visitor can see themselves in (a callsign preview on the team's nameplate), one action, and the mark holding on the final screen.

**Bans.** No video, no `scrub`, no photographic ground, no `drift`, no crossfading pinned type act, no second 3D stage, no full-frame scrim. The subject never leaves the frame until the document covers it. Sections after the stage never bleed media under type.

**Why the eight lost.**
Filmic one-shot needs a film and hides seams with a chain; there is no footage and the seams here are the point (the document covers the arena).
Chaptered editorial is paper and folios; wrong for a game team.
Live surface would turn the page into a game menu, which is a transformation of the ask (the user asked for a site with information, not a simulator) and its honesty rule forbids the invented roster the user asked for.
Continuous world requires worldflight clips.
Typographic poster removes the media, and the media is the whole request.
Gallery/catalog makes the roster the hero; the hero is one character.
Split stage has no second side.
Rhythmic cutlist bans `pin` and holds, and a character turning under the hand needs a held stage.

## Signature move: Respawn

Scroll past the turn and Kabeer disassembles: every splat flies outward along its own spiral, shrinks, and shifts toward the accent so the swarm reads as sparks. The swarm keeps spinning with the wheel. Keep scrolling and it snaps back into him, now facing the camera, and KABEER stamps in.
Coded in `splat.js` (a per-splat assembly uniform, offsets stored in the splat texture, depth sort aware of the scatter) and driven from act 3's `--sc-p`. The engine is untouched.

The compass dial is the nav, not the move. The move is the respawn, and it is the peak.

## Fingerprint gate

Registry at `/home/shamlik/aiwork/random/falcon/FINGERPRINTS.md` is empty. First build: nothing to clear. Row appended after shipping.

## Score

| Act | Beat | Device | Why this one |
|---|---|---|---|
| 1 | Arrival | bespoke turntable + `parallax` planes (wordmark recedes, foreground embers lead) | The subject moving under the hand from the first notch is the strongest open available with this asset |
| 2 | Circling | `flow` + `in`, `reveal` on the nameplate | Dossier lines are read, not watched; they arrive in reading order while the turn continues underneath |
| 3 | Respawn | `pin` + bespoke assembly | The peak needs a held frame and the most scroll room; the copy holds still while the subject does everything |
| 4 | Grounding | `flow` + `in`, hard ground | Information, not experience: compress it, keep it legible, no motion under it |
| 5 | Belonging | `pan` + `tilt` | Lateral reads as a roster, not a ranking |
| 6 | Resolve | `pin` + `magnet` + a live input | The page stops moving and starts responding |

Checks: six device families (turntable/parallax, flow, reveal, pin, pan, pointer). No family twice in a row. Zero `scrub`. Peak has the largest span.
Measured after the build: 12.9 viewport-heights on desktop, 13.3 on a 390px phone, 14.2 on a 360x640 compact phone, six acts. Outside the 13.6 to 13.8 band on desktop.

## World

Procedural nocturne. Cold near-black canvas with a faint perspective grid floor and a slow amber light sweep, foreground embers, one amber accent. No generated imagery.
The character's own colours (warm salmon skin, near-black gear) sit against the cold ground so he reads as the only warm thing in the arena until the sparks.

## Type

Display: Russo One (angular, heavy, the gaming-title face the request asks for).
Text and labels: Chakra Petch (squared technical sans, readable at body size, matches the HUD idiom).
Two families.

## Colour

```
--sc-canvas:     #0A0C12   cold near-black
--sc-surface:    #12161F
--sc-ink:        #F1EFE8
--sc-ink-soft:   #98A0B0   tinted toward the canvas blue
--sc-accent:     #F7B32B   falcon amber
--sc-accent-ink: #17110A
```

Act 4 inverts to a lit ground (amber-tinted bone) with its own ink restated, per taste.md.

## Copy label

The one action, everywhere: **Join the Falcons**.

## Placeholders the team must replace

Everything about the team other than the name Falcon and the name Kabeer is placeholder copy written to the user's "few random information" request: the four teammate callsigns and roles, the rules, the facts, and the join destination URL.
No invented statistics or counters anywhere.


---

## Verification record (2026-09-04)

Harness (`shoot.mjs`, 6 samples per act, 35 frames per pass) on desktop 1440x900, phone 390x844 and reduced motion:
no dead scroll, every cue clears 4.5:1 at its worst frame, no console errors.
The one flagged request is the deliberate early stop of the splat download once the device's splat budget is reached (`net::ERR_ABORTED`); on a host that honours `Range` it becomes a 206 and disappears.
Interaction checks: rail overflow 1349px desktop / 1794px phone; horizontal overflow 0 at every section; the dial drag scrolls the page; the callsign input sanitises and previews; the join action copies the tag and reports only on real clipboard success; no-WebGL shows the poster; no-JS renders the h1 and six readable sections.
Not verified: a real phone (iOS decode and touch), a real GPU's frame rate (headless ran on SwiftShader with a 70k-splat budget), fonts when Google Fonts is unreachable (system fallbacks are declared).

## Feel check (cold, from the final desktop contact sheet)

| Act | Intended | Felt | Diff |
|---|---|---|---|
| 1 | Arrival | Arrival: wall-size FALCON, the head already turning at the second frame | none |
| 2 | Curiosity | Circling: back of his head at frame 5, other profile by frame 8, lines landing left and right | same family, kept |
| 3 | Awe | Awe: frame 12 is a field of sparks with nothing else on it, frame 14 is the name over his face | none |
| 4 | Grounding | Hard reset: the lit ground rising over the face reads as a cut, then a readable page | intended |
| 5 | Belonging | Roster: five faces pulled sideways, the captain first and warmer | none |
| 6 | Resolve | Stop: the nameplate, one button, seven identical frames | none |

The peak is the largest visual change on the sheet (dark head to full-screen sparks to the name) and holds the most frames (8 of 35).
The act before it is quieter (two plain profile frames with no copy). The last screen holds with content on it.
One change came out of the check: the stamp's fade originally straddled a sample and showed as a half-faded name; the cue now ends at 0.95 so it is full at one sample and gone at the next.
