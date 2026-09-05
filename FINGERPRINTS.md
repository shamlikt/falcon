# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| falcon (2026-09-04) | Turntable dossier (new): one live 3D subject on a fixed stage, document scrolls past it, then hard-cut sections cover it | HUD, no wordmark bar: compass dial bottom-left showing the subject's heading (drag it and the page scrolls), section index bottom-right, one CTA chip top-right | Live Gaussian-splat bust turning under the hand from the first notch, wall-size wordmark BEHIND the subject, ember plane in front, corner copy | flow > flow > pin(peak, 3.4) > flow(lit ground) > pan(3.4) > pin(1.2); 6 acts, 12.9vh desktop / 13.4vh phone; zero scrub | Callsign input renders a live nameplate preview, one action that copies the tag (or links out when configured), mark and footer hold | Respawn: scroll scatters the 200k-splat subject into an amber swarm that spins with scroll speed, then snaps it back facing you with the name stamped | Procedural nocturne: cold near-black, perspective grid, amber sweep, no generated imagery, the splat is the only asset | 4500 |

*(first row above; from the second build onwards this table is the constraint.)*

---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **Turntable dossier** grammar: a fixed live 3D subject with the document scrolling past it, covered by hard-cut sections after the subject's arc. Taken by falcon.
- **HUD compass dial as scrubber** (heading readout that scrolls the page when dragged) and a bottom-right section index. Taken by falcon.
- **Wordmark behind the subject** as the hero composition (subject occludes wall-size type). Taken by falcon.
- **Respawn** signature move: per-splat scatter and re-assembly of a Gaussian splat driven from act progress. Taken by falcon.
- **Callsign nameplate preview** as the close. Taken by falcon.
- Act band: 6 acts at 12.9vh (desktop). Taken by falcon.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
