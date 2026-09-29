---
name: Frank
description: A print proof with opinions, calibrated for marketing and focused work
colors:
  proof-stock: "#dce1de"
  paper: "#f5f1e8"
  pond-ink: "#102e28"
  pond-ink-soft: "#35504a"
  misregister-pink: "#ff4fa3"
  duck-yellow: "#ffc62c"
  bill-orange: "#e84916"
  paper-white: "#fffef8"
  registration-rule: "#8b9b96"
typography:
  display:
    fontFamily: "Recursive Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(3.5rem, 7.1vw, 6rem)"
    fontWeight: 860
    lineHeight: 0.91
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Recursive Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(1rem, 1.2vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  proof-label:
    fontFamily: "Recursive Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  square: "0"
  stamp: "50%"
spacing:
  control-x: "17px"
  control-y: "11px"
  page-gutter: "clamp(18px, 4vw, 64px)"
components:
  button-primary:
    backgroundColor: "{colors.pond-ink}"
    textColor: "{colors.paper-white}"
    typography: "{typography.proof-label}"
    rounded: "{rounded.square}"
    padding: "{spacing.control-y} {spacing.control-x}"
    height: "51px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.pond-ink}"
    typography: "{typography.proof-label}"
    rounded: "{rounded.square}"
    padding: "{spacing.control-y} {spacing.control-x}"
    height: "51px"
---

# Design System: Frank

## Overview

**Creative North Star: "A print proof with opinions."**

Frank's visual world turns agent-plan review into a physical print pass. Silver
stock, dense pond-green ink, duck yellow, hot-pink misregistration, square
proof surfaces, and marks that reveal how the work was made form one durable
identity. The intensity changes by surface; the identity does not.

The duck is product behavior, not mascot decoration. Frank isolates decisions,
leaves receipts, and stamps a verdict. Visual flourishes should make that
mechanism easier to understand rather than decorate a generic developer landing
page.

**Key Characteristics:**

- Off-register color and hard-edged shadows create physical depth.
- Large compressed type carries the blunt voice.
- Rules, proof labels, density marks, and stamps encode review state.
- One print-pass animation demonstrates the product's central action.

## Surface Modes

### Website — Persuade

The marketing site is the loud print studio. It earns attention with large
compressed type, asymmetric proofs, visible registration errors, hard offsets,
and the full physical-print metaphor. The sections below describe this
high-intensity expression unless stated otherwise.

### Desktop app — Operate

The desktop app is the quiet proof desk. It keeps the native 520px popover,
keyboard-first flow, one-call focus, and dense reading rhythm. Personality is
concentrated in evidence-bearing details:

- dark ink proof bars for plan and settings headers;
- square paper/proof-stock insets inside the rounded native shell;
- yellow for Frank and the current point of attention;
- orange only when code contradicts the plan;
- green only for decided outcomes;
- pink only for focus, registration offsets, and transient action;
- small registration marks, hard offsets, and a restrained ready stamp.

The app never copies the site's hero scale, rotating reading surfaces, generous
campaign spacing, or decorative composition. Expression must clarify current
state, evidence, or action. If it competes with the plan, it is too loud.

## Colors

The palette combines cool proof stock with dark ink and three printing colors.

### Primary

- **Pond Ink** (`#102e28`): Primary text, dark fields, structural rules, and
  high-contrast controls.
- **Proof Stock** (`#dce1de`): The cool silver page ground and neutral print
  surface.

### Secondary

- **Duck Yellow** (`#ffc62c`): Frank, selected decisions, and useful findings.
- **Misregister Pink** (`#ff4fa3`): Focus, offset shadows, and the print pass.

### Tertiary

- **Bill Orange** (`#e84916`): Warnings, provocative copy, and strong section
  fields.

### Neutral

- **Paper** (`#f5f1e8`): Plan sheets, transcripts, and readable light surfaces.
- **Paper White** (`#fffef8`): Text on dark ink.
- **Soft Ink** (`#35504a`): Secondary body copy on light surfaces.
- **Registration Rule** (`#8b9b96`): Low-emphasis rules and density marks.

### Named Rules

**The Misregistration Rule.** Pink and yellow offsets must attach to a real
printed object, type block, or state. They are never ambient decoration.

**The Local Pond Rule.** Dark green replaces generic black so every high-contrast
field belongs to Frank's world.

## Typography

**Display Font:** Recursive Variable, with Arial Narrow and system sans-serif
fallbacks  
**Body Font:** Recursive Variable, with system sans-serif fallbacks  
**Label/Mono Font:** Recursive Variable in its monospaced axis

**Character:** Recursive shifts between blunt grotesque display, casual
conversation, and proof-label mono without changing families. Variable axes do
the expressive work.

### Hierarchy

- **Display** (860, `clamp(3.5rem, 7.1vw, 6rem)`, 0.91): First-view promises
  and section-defining statements, usually balanced under 14 characters per
  line.
- **Headline** (800+, `clamp(2.75rem, 6.4vw, 5.5rem)`, 0.9): Major section
  transitions and verdicts.
- **Title** (700+, `clamp(1.5rem, 3vw, 2.625rem)`, 1): Product evidence and
  process headings.
- **Body** (400-650, `clamp(1rem, 1.2vw, 1.1875rem)`, 1.45): Explanations,
  kept below 65 characters where practical.
- **Proof Label** (760-800, 12-15px, normal tracking): Plan metadata, control
  labels, notes, and measurements.

### Named Rules

**The Voice Axis Rule.** Use Recursive's casual axis for spoken Frank lines and
its mono axis only for code, measurements, shortcuts, and print metadata.

## Layout

Pages use a fluid gutter (`clamp(18px, 4vw, 64px)`) and a 1440px maximum
content width. Desktop compositions are deliberately asymmetric: narrative and
evidence face each other rather than collapsing into repeated cards. Vertical
spacing is generous, with section transitions between roughly 90px and 210px.

At 1100px, the first view becomes a single-column proof with a centered maximum
width and secondary navigation disappears. At 760px, multi-column evidence
becomes one column, actions become full width, and printed objects lose enough
rotation and shadow offset to avoid clipping while retaining the material idea.

## Elevation & Depth

Depth comes from hard off-register ink offsets, double prints, rotation, and
overlapping paper—not soft product-card shadows. The system is flat by default;
only proof objects and primary actions lift from the stock.

### Shadow Vocabulary

- **Three-ink proof** (`10px 10px 0 #ff4fa3, 20px 20px 0 #ffc62c`): The
  interactive plan proof at large breakpoints.
- **Primary action** (`7px 7px 0 #ff4fa3`): The current primary call to action.
- **Copied note** (`-9px 9px 0 #ffc62c, -18px 18px 0 #ff4fa3`): A completed
  output pulled from the press.

### Named Rules

**The Hard Shadow Rule.** Shadows represent offset ink or stacked paper. Avoid
neutral soft elevation and zero-offset glow.

## Shapes

Controls, proof sheets, labels, and content fields use square corners and
2-3px ink borders. Rotation stays subtle, usually within three degrees. Circles
are reserved for registration marks and the local-pond stamp, where their print
meaning is explicit.

## Components

### Buttons

- **Shape:** Square, with a 2px pond-ink border and at least a 51px touch target.
- **Primary:** Pond ink on paper white with a 7px pink print offset.
- **Hover / Focus:** Hover compresses the offset through a 3px translation.
  Keyboard focus uses a 4px pink outline with a 4px offset.
- **Secondary:** Transparent proof stock with the same structural border.

### Chips

- **Style:** Compact square proof tabs with 2px ink borders.
- **State:** Selected tabs use duck yellow plus a 3px pink print offset; pressed
  state is also exposed semantically.

### Cards / Containers

- **Corner Style:** Square.
- **Background:** Proof stock or paper according to reading density.
- **Shadow Strategy:** Only signature proofs and completed outputs receive hard
  offsets.
- **Border:** 2-3px pond ink or registration-rule separators.
- **Internal Padding:** Fluid from 16px to 58px according to role.

### Navigation

The masthead is a three-part print lockup: duck wordmark, short section links,
and source destination. Links use honest underlines rather than pill chrome.
Secondary links disappear at tablet width; the brand and source stay available.

### Plan Press

The signature component is a slightly rotated paper proof containing synthetic
plan evidence, a 47-line density strip, three decision tabs, Frank's current
read, and a full-width print control. The squeegee animation runs only after the
visitor asks for it and resolves into highlighted consequential lines.

## Do's and Don'ts

### Do:

- **Do** use physical print artifacts to explain review, evidence, and decision
  state.
- **Do** keep the product mechanism visible in the first viewport.
- **Do** preserve blunt, specific copy and label illustrative plan evidence.
- **Do** retain keyboard focus, reduced-motion behavior, and high contrast.

### Don't:

- **Don't** replace the plan proof with a generic app screenshot or hero metric.
- **Don't** turn sections into a repeated rounded SaaS-card grid.
- **Don't** use gradients, glass, glow, or ambient blobs.
- **Don't** scatter duck imagery where it does not explain a product state.
