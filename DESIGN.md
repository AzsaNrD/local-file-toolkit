# Design Direction: Local File Toolkit

Replaces the earlier "clean utility, neutral grey" direction. The owner chose
Cyberpunk-lite HUD for the retheme (2026-11-12). PRD Section 10.6 mirrors this file.

## Identity

A local, offline file-utility toolkit (PDF, image and office conversion), used
by one technically comfortable person on their own machine. It reads as an
instrument panel: dark by default, one cyan readout color, sharp corners,
monospaced numbers. The product's honesty (files never leave the machine) stays
understated: no sales language, no fake stats.

## Personality

Precise, technical, calm. Cyberpunk by atmosphere (dark field, one neon accent,
HUD grid, monospace readouts), not by spectacle: no glitch, no scanlines, no
neon on everything.

## Palette

Tokens live in `src/app/globals.css`. Roles are semantic: components never use
raw colors. Ratios were measured with the antislop contrast checker.

| Token | Dark (default) | Light ("daylight") | Use |
|---|---|---|---|
| `--background` | `#07090d` | `#f3f5f7` | Page |
| `--surface` | `#0d1117` | `#ffffff` | Cards, inputs, selects, list rows |
| `--foreground` | `#e6edf3` | `#0b1220` | Body text |
| `--muted` | `#141a22` | `#e7ebef` | Badges, code, progress track, hover fill |
| `--muted-foreground` | `#8b98a8` (5.96:1 on muted) | `#4a5868` (6.07:1) | Secondary text |
| `--border` | `#1f2a36` | `#d3dae2` | Decorative separators only |
| `--border-strong` | `#5b6e83` (3.61:1 on surface) | `#6b7a8c` (4.01:1 on page) | Control edges (3:1 non-text bar) |
| `--accent` | `#22d3ee` (9.68:1 on muted) | `#0b6a84` (5.14:1 on muted) | The one accent |
| `--accent-foreground` | `#031a20` (9.91:1 on accent) | `#ffffff` (6.16:1) | Text on accent fills |
| `--ring` | `#22d3ee` | `#0b6a84` | Focus indicator |
| `--danger` | `#ff4d8d` (6.04:1 on surface) | `#be185d` (5.04:1 on muted) | Errors and destructive only |
| `--danger-foreground` | `#2a0010` (6.06:1) | `#ffffff` (6.04:1) | Text on danger fills |

Why these colors: cyan is the readout color of terminals and instrument
displays, which fits a precision tool. Danger is neon pink so it never
competes with the cyan accent. Accent is used for primary actions, active and
hover edges, tool icons (on the home cards and beside each tool page title), the `>_`
mark, the progress bar and the check mark on a finished result. Nothing else.

Dark is the default because this is a developer-style utility used in long
sessions, not because dark looks "tech". Light mode is a fully working
variant with its own measured values. The toggle persists the choice in
`localStorage`; with nothing stored, the app is dark.

## Typography

- Body: IBM Plex Sans (400/500/600). Engineered, clear at 12-14px.
- Headings and readouts: JetBrains Mono (400/500/600) for page and card titles,
  file sizes, page counts, percentages, filenames being edited, code. Numbers
  use `tabular-nums`. Reason: fixed-width digits make sizes and counts scan like
  an instrument panel. Body paragraphs and long descriptions stay in Plex Sans.
- Both are self-hosted through `next/font/google` at build time. Nothing loads
  from a third party at runtime (PRD NF6).
- No uppercase labels with wide tracking.

## Shape

- Corners are near-square: `--radius-control` 2px (controls, badges, thumbnails),
  `--radius-card` 4px (cards, lists). Mapped onto Tailwind's `rounded-md` and
  `rounded-lg` in `@theme`, so existing classes follow the tokens.
- Borders are 1px. Cards carry one 10px accent corner tick (top-left): the
  identity motif, static and decorative.
- Shadows are not used for elevation. The only shadow token is `--shadow-glow`.

## Glow

`--shadow-glow` is a 1px accent ring plus a soft 14px halo in dark mode, and
the hairline ring alone in light mode. It appears only on the single element
the user is acting on: keyboard focus, hover on a primary button or a tool
card, an active drag-over dropzone. Never as a resting state and never on
several elements at once.

## Background grid

A 32px line grid at about 5% opacity sits fixed behind the page. Reason: the
HUD identity motif for a tool that presents itself as a readout. It is static,
sits behind content only, and is faint enough that text contrast is measured
against the flat `--background` / `--surface` values.

## Motion

Decorative animation is off. Motion exists only for state changes: hover and focus
color or border (under 200 ms), a 1px press on buttons, progress width, the result
panel easing in once a run finishes (160 ms fade and 6px rise), the indeterminate
progress segment sweeping across its track, thumbnail rotation preview. No glitch, no
scanline sweep, no scroll reveal. `prefers-reduced-motion` turns transitions and
animation off; the progress bar then shows a static fill.

## Interaction and accessibility (unchanged)

- One focus indicator: the `focus-ring` utility (2px `--ring` outline, 2px
  offset, plus glow). Every interactive element uses it.
- Minimum 44px tap targets. Visible focus on every control. Dropzone activates
  with Enter (PRD NF7).
- Text contrast 4.5:1, control edges and focus ring 3:1, in both modes.

## Composition

- Home: tool cards grouped PDF / Image / Convert, 1/2/3 column grid, generated
  from the `TOOLS` registry. A sticky category filter
  (All / PDF / Image / Convert) narrows the grid; the chosen filter is filled with
  the accent, the rest are outlined. Tool pages carry a `Switch tool` menu next
  to the back link. Header carries the `>_ Local File Toolkit` mark.
- Every tool page shares `ToolShell`: Files, Options, Action, Progress, Result.
  The repetition is deliberate: a toolkit of small tools benefits from muscle
  memory.

## Dials (antislop Part 3)

**Reading this as:** a local developer/power-user utility toolkit for one
technical user, in a restrained HUD language.

- **ENERGY: 2** (a clear identity from color, type and grid, but a tool, not a pitch)
- **RHYTHM: 1-2** (the shared `ToolShell` is uniform on purpose; the home grid may vary)
- **MOTION: 1** (state transitions under 200 ms only)

Owner-chosen direction elements that touch named antislop patterns (R-37):
neon accent (R-01), background grid (R-07), monospace headings (R-06) and
glow (R-13) were selected by the owner for this retheme. Each is kept with the
stated purpose and dose cap above.
