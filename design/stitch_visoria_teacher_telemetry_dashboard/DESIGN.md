---
name: Obsidian Telemetry
colors:
  surface: '#10141a'
  surface-dim: '#10141a'
  surface-bright: '#353940'
  surface-container-lowest: '#0a0e14'
  surface-container-low: '#181c22'
  surface-container: '#1c2026'
  surface-container-high: '#262a31'
  surface-container-highest: '#31353c'
  on-surface: '#dfe2eb'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dfe2eb'
  inverse-on-surface: '#2d3137'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#10141a'
  on-background: '#dfe2eb'
  surface-variant: '#31353c'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-lg: 1rem
  margin: 1rem
  margin-lg: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system embodies an authoritative, mission-critical cockpit tailored for educators, learning analysts, and academic proctors. The emotional tone balances high-frequency vigilance with intellectual composure: calm, surgical, objective, and deeply respectful of cognitive load. Rather than leaning on casual gamification or consumer SaaS fluff, the aesthetic mirrors precision industrial instrumentation and real-time observability suites.

Every visual token exists to accelerate situational awareness. Information is categorized strictly by chromatic priority: nominal attention and active flow states register in clinical emerald, cognitive drift and telemetry dropouts register in urgent amber, and automated Socratic dialogue prompts register in cognitive violet. Surfaces sit recessed within deep slate neutrals, ensuring metrics and live participant states command the visual field without glare or distraction.

## Colors

The palette leverages pure functional layering within dark space to maximize contrast ratios and minimize eye fatigue during sustained monitoring sessions.

### Functional Roles
- **Primary (`#10b981` / `#059669`):** Represents optimal engagement, validated comprehension milestones, verified student presence, and active Socratic flow states.
- **Secondary (`#8b5cf6` / `#7c3aed`):** Dedicated exclusively to Socratic heuristics, adaptive dialogue interventions, algorithmic scaffolding, and AI-driven pedagogical probes.
- **Tertiary (`#f59e0b` / `#d97706`):** Reserved for latency spikes, sustained gaze drift, conversational stalling, and attention lapse warnings requiring educator triage.
- **Neutral Canvas (`#0d1117`, `#161b22`, `#21262d`):** A stepped hierarchy of near-black charcoal surfaces providing separation without tonal vibration.
- **Structural Borders (`#30363d`):** Razor-sharp, single-pixel boundary dividers that enforce visual discipline across ultra-dense dashboard grids.
- **Typography & Icons (`#f1f5f9`, `#94a3b8`, `#64748b`):** Clean cool-slate tiers offering AAA-grade legibility against charcoal base layers.

## Typography

The typographic hierarchy prioritizes rapid micro-scanning through disciplined proportional scale and strict font role separation.

- **Primary Interface (Inter):** Applied across all structural headlines, navigation, student identities, contextual dialogs, and instructional body copy. Numeric tabular figures (`tnum`) must be enforced globally on Inter for dashboard metrics, timestamps, and row counts to avoid shifting layouts during high-frequency telemetry updates.
- **Telemetry & Metadata (JetBrains Mono):** Reserved for technical indicators, real-time attention scores, machine confidence values, Socratic prompt state codes, and telemetry payload timestamps.
- **Rhythm & Case:** Section super-headers and telemetry badges use uppercase styling via `label-xs` with expanded tracking to maintain legibility at sub-12px sizes.

## Layout & Spacing

This design system uses a high-density, compact spacing matrix anchored around a strict 4px base increment. The architecture prioritizes data per square inch while preventing cognitive overload through disciplined 1px grid compartmentalization.

- **Canvas & Containers:** The viewport functions as an edge-to-edge application shell without arbitrary dead margins. The default desktop layout employs a multi-pane split: fixed global telemetry rail (56px), collapsible cohort tree (240px), dynamic multi-column observation matrix (12-column fluid grid, `0.75rem` gutter), and an optional collapsible Socratic intelligence drawer (360px).
- **Density Thresholds:** Table cell padding maintains a compact vertical rhythm (`0.375rem` to `0.5rem`), ensuring upwards of 25 cohort members remain concurrently observable above the fold.
- **Responsive Adaptation:**
  - **Desktop (>1280px):** Full multi-pane telemetry grid; concurrent cohort heatmaps, raw event logs, and transcript streams visible simultaneously.
  - **Tablet (768px - 1279px):** Socratic intelligence drawer collapses into an overlay flyout; observation matrix locks to 6-column reflow.
  - **Mobile (<768px):** Reflows to single-column priority feed. Metric widgets display in dual-column metric tiles with horizontal card swipe for active student feeds.

## Elevation & Depth

Visual hierarchy does not rely on soft blur shadows, ambient glow stacks, or translucent glass blurs. Depth is achieved entirely through disciplined tonal layering and high-precision border demarcation.

- **Surface Layer 0 (`#0d1117`):** Primary canvas background for the application framework and foundational dashboard canvas.
- **Surface Layer 1 (`#161b22`):** Primary workspace containers, metric panels, data tables, and telemetry card housings.
- **Surface Layer 2 (`#21262d`):** Nested headers, table row hover states, data chips, control groups, and segmented button frames.
- **Surface Layer 3 (`#30363d`):** Popovers, dropdown menus, context tooltips, and floating control palettes.
- **Structural Outlines:** Every container tier is bounded by a crisp `1px solid #30363d` perimeter. When a card transitions into an active alert state, the border shifts directly to the state color (`#10b981`, `#f59e0b`, or `#8b5cf6`) with zero drop shadow, preserving strict instrumental geometry.

## Shapes

The design system standardizes on a refined, architectural curvature profile between 8px and 12px for primary functional containment, balancing modern ergonomics with control-room austerity.

- **Base Components (6px to 8px):** Buttons, segmented switch items, text inputs, telemetry pills, and status tags standardize on concise, compact radii (`rounded` / 0.375rem to 0.5rem).
- **Panels & Cards (8px to 12px):** Primary telemetry tiles, live video stream containers, and modal dialogues use consistent 10px to 12px corners (`rounded-lg` / 0.625rem to 0.75rem).
- **Indicator Elements:** Real-time pulse pings, connection node indicators, and avatar markers use fully circular tokens (`rounded-full`) to immediately differentiate live presence nodes from structural containment UI.

## Components

### Buttons & Controls
- **Primary Action:** Solid `#10b981` background, `#041e15` text, medium weight, 8px corner radius. Hover state darkens to `#059669`. Focus rings display a 2px offset border in `#10b981`.
- **Secondary Action:** Transparent background with `#21262d` base, `1px solid #30363d` border, `#f1f5f9` text. Hover shifts background to `#30363d`.
- **Socratic Interaction Action:** `#8b5cf6` with pure white text or outline variant with `#8b5cf6` border and `#c4b5fd` text.
- **Telemetry Ghost Buttons:** Flat slate icon triggers with zero border until hover, transitioning instantly to `#21262d`.

### Telemetry Badges & Chips
- Monospaced typography (`label-xs`) housed in 6px rounded frames.
- **Focus Nominal:** `#10b98115` background, `#10b981` text, `1px solid #10b98140` border.
- **Attention Drift Alert:** `#f59e0b15` background, `#f59e0b` text, `1px solid #f59e0b40` border.
- **Socratic Intervention:** `#8b5cf615` background, `#a78bfa` text, `1px solid #8b5cf640` border.

### Data Tables & Participant Lists
- Strict `1px solid #30363d` interior horizontal rules; no vertical internal borders.
- Header row styled with `#161b22` background, tracking expanded, uppercase `label-xs` in `#94a3b8`.
- Rows feature instantaneous background color shift to `#21262d` on cursor pass; active selected rows feature a 2px left accent border corresponding to student state.

### Form Inputs & Search Fields
- Inset dark styling: `#0d1117` background with `1px solid #30363d` borders.
- Monospaced input text for threshold tuning, parameter filters, and query strings.
- Active focus state overrides border to `#10b981` without ambient outer glow.

### Telemetry Stream Cards
- High-density containment units with a discrete `#161b22` background and `#30363d` border.
- Divided into two zones: a compact 32px header housing identity and live state tag, followed by the primary metric or video waveform panel.
- Header borders use a subtle `1px solid #21262d` bottom separator.

### Attention Sparklines & Telemetry Scaffolds
- Direct SVG line graphs without fill gradients underneath.
- Lines render at a uniform 1.5px stroke width: nominal attention rendered in `#10b981`, drift events rendered in sharp segmented `#f59e0b`, and pedagogical AI prompts marked via vertical dashed `#8b5cf6` milestone lines.