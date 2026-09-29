# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers who use AI coding agents and need to review an agent-written plan
without losing momentum. They are usually in the middle of implementation,
working in a local repository, and deciding whether a plan's hidden assumptions
and trade-offs fit the code they actually have.

## Product Purpose

Frank finds the latest coding-agent plan, reads the repository context it
references, surfaces the few decisions that deserve human judgment, talks those
decisions through one at a time, and produces a short note for the agent.
Success means the developer catches consequential plan mistakes before they
become rework without having to review every routine step.

## Positioning

Frank is not another coding agent and does not edit code. It is a local,
voice-first rubber duck that focuses the human on the choices an agent's plan
made explicitly or silently, checks those choices against the real repository,
and hands the decisions back to the agent.

## Operating Context

Frank is a desktop companion for coding sessions. Developers summon it with a
hotkey or menu-bar control, talk or type, review one call at a time, and copy
the resulting note into Claude Code, GitHub Copilot, Cursor, an API-backed
model, or Ollama. Voice capture, transcription, pronunciation, and synthesis
run on the developer's machine.

## Capabilities and Constraints

- Finds recent plans and reads referenced repository context with confirmation.
- Identifies options, silent choices, and assumptions, prioritizing decisions
  that are hardest to undo.
- Supports voice-first, hands-free, push-to-talk, and chat workflows.
- Uses the developer's existing AI subscription or a local Ollama model.
- Never edits code or runs commands through the connected agent.
- Has no accounts, cloud sync, telemetry, or hosted speech processing.
- The current distributable is an early unsigned macOS build from CI.
- The marketing site must remain static and deployable through GitHub Pages.

## Brand Commitments

The product is named Frank and is represented by a rubber duck. The voice is
blunt about plans, decent to people, concise, dry, and willing to disagree.
Existing copy treats duck behavior as product behavior rather than decorative
mascot lore. The ASCII duck, the yellow duck mark, and the line “He's a duck.
He's frank.” are established identity assets.

## Evidence on Hand

- Product narrative, workflow, privacy details, compatibility, FAQ, and current
  installation steps in `README.md`.
- ASCII Frank banner in `assets/frank-banner.svg`.
- Real desktop UI and design tokens under `apps/desktop/src/`.
- No customer logos, testimonials, usage metrics, pricing, or stable release
  download are available and none should be invented.

## Product Principles

- Put consequential decisions ahead of exhaustive review.
- Keep the human responsible for judgment and the coding agent responsible for
  implementation.
- Explain the issue plainly, then get out of the way.
- Keep repository context and audio local unless the developer explicitly
  sends text to their chosen model.
- Make the duck useful before making it charming.

## Accessibility & Inclusion

The site and product should work with keyboard navigation, visible focus,
reduced motion, high-contrast text, and clear language without requiring audio
to understand the product.
