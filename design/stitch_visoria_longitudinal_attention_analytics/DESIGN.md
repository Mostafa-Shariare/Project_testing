---
name: Precision Analytical Dark
colors:
  surface: '#101319'
  surface-dim: '#101319'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#191c22'
  surface-container: '#1d2026'
  surface-container-high: '#272a30'
  surface-container-highest: '#32353b'
  on-surface: '#e1e2eb'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2d3037'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#ca8100'
  on-tertiary-container: '#3e2400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#101319'
  on-background: '#e1e2eb'
  surface-variant: '#32353b'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0em
  metric-display:
    fontFamily: JetBrains Mono
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.03em
  metric-label:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.04em
  label-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.25rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system embodies an austere, data-first analytical ethos tailored for institutional leaders, academic researchers, and educators navigating complex student outcome metrics. The aesthetic balances high information density with surgical visual restraint—eliminating non-essential decoration to allow cohort trends, anomaly indicators, and predictive vectors to emerge naturally.

The visual style combines **Minimalism** and **Tonal Precision**:
- Surfaces rely on deep charcoal canvases accented by structured, low-contrast bounding strokes.
- Density is prioritized: compact line heights, razor-sharp tabular figures, and consolidated vertical rhythm mimic the efficiency of high-end developer instrumentation and institutional trading terminals.
- Visual hierarchy is established through surface elevation tiers and functional semantic signals rather than expressive surface treatments.
- The emotional tone conveys quiet authority, computational rigor, and calm oversight during critical review cycles.

## Colors

The color system operates on an ultra-dark slate continuum designed to prevent ocular fatigue over sustained monitoring sessions while ensuring clear dynamic contrast.

### Palette Mechanics
- **Base Canvas & Layers**: The lowest level begins at `#0B0D11` (viewport base), stepping up to `#12151B` (structural frames/sidebars), `#181C24` (primary surface container/cards), and `#1F2430` (elevated interaction targets, hover states, and popovers).
- **Strokes & Boundaries**: Component contours and divider lines strictly utilize `#282E3C` at full opacity or `rgba(255, 255, 255, 0.07)` on nested elements to anchor geometry without visual friction.
- **Primary / Intervention (`#8B5CF6`, hover `#A78BFA`)**: Violet designates deliberate instructor touchpoints, algorithmic suggestions, cohort curation tools, and active selection states.
- **Secondary / Growth & Health (`#10B981`)**: Emerald represents positive trajectory, milestone attainment, baseline health, and upward mastery delta.
- **Tertiary / Warning & Attrition (`#F59E0B`)**: Amber highlights score drift, assignment delinquency, prerequisite friction, and early warning flags.
- **Critical Failure (`#EF4444`)**: Reserved exclusively for terminal drops, critical attendance breach, or acute systemic risk.
- **Text & Data Layers**:
  - High Emphasis: `#F9FAFB` (headings, primary metrics, active values)
  - Medium Emphasis: `#9CA3AF` (labels, metric metadata, inactive column headers)
  - Low Emphasis / De-emphasized: `#6B7280` (tabular borders, secondary axes, disabled hints)

## Typography

Typography is constructed around tabular alignment, vertical condensation, and crisp legibility under dense informational clustering.

- **Primary Typeface (Inter)**: Handles layout chrome, section hierarchies, table cell text, filters, and standard operational UI. The font features default OpenType configurations with `cv02`, `cv03`, `cv04`, and `cv11` active for clarified glyph differentiation (`1`, `I`, `l`, and zero disambiguation).
- **Secondary Monospace Typeface (JetBrains Mono)**: Governs all numeric indicators, data tables, cohort IDs, time intervals, delta percentages, and timestamp chips. It enforces strict column verticality across data grids, preventing jitter during live metric updates.
- **Scale Rules**: Headings maintain tight letter spacing (`-0.025em`) to retain visual density. All micro-metadata tags use uppercase monospace tracking (`0.04em`) to establish clear functional distinction against running copy.

## Layout & Spacing

The layout model is anchored by a high-efficiency fluid multi-panel architecture designed to leverage wide modern desktop viewports while gracefully telescoping down.

### Grid & Density Architecture
- **Desktop (≥ 1280px)**: 12-column adaptive fluid grid nested within a fixed collapsible sidebar frame (64px collapsed, 240px expanded). Section gutter is tuned to `1.25rem` (`20px`) with page boundary margins set to `1.5rem` (`24px`).
- **Tablet (768px - 1279px)**: 8-column layout with `1rem` (`16px`) gutters. Secondary metric columns collapse into scrollable data tables; analytics cards transition to twin-stack configuration.
- **Mobile (< 768px)**: 4-column layout with `1rem` margins and `0.75rem` gutters. Primary metric blocks convert into a single-column sequence; deep comparison matrixes invoke an explicit horizontal scroll rail with frozen student/cohort key columns.

### Vertical Rhythm
A baseline compact rhythm governs interior panels. Core metric card internals use `space-md` (`0.75rem`) padding to maximize vertical visibility without requiring pagination or infinite scroll on typical dashboards.

## Elevation & Depth

This system avoids blurred, drop-shadow skeuomorphism in favor of **Tonal Layering** combined with **Low-Contrast Outlines**. Visual depth indicates contextual containment and interactive priority.

### Surface Tiers
1. **Base Floor (`#0B0D11`)**: Deepest substrate. Visible only through layout margins, grid gutters, and under global canvas backdrops.
2. **Structural Chassis (`#12151B`)**: Persistent side navigation, global control header, data grid filter bars, and footer summaries.
3. **Card Container (`#181C24`)**: Primary unit of containment for graphs, cohort rosters, and KPI summaries. Defined by a continuous `1px` border of `#282E3C`.
4. **Elevated Dynamic (`#1F2430`)**: Hover states on interactive data rows, popovers, contextual tooltips, and modal diagnostic windows.
5. **Overlays & Modals**: Enhanced with an intentional minimal ambient shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.65)`, rimmed with a slightly higher contrast stroke (`#3B4457`) to detach cleanly from underlying charts.

Backdrop blurs (`backdrop-filter: blur(12px)`) are applied solely on sticky table headers and metric filter toolbars overlaid above scrolling tabular records (`rgba(18, 21, 27, 0.85)`).

## Shapes

The design system employs a **Soft (`1`)** structural radius. Tight corner geometry reinforces the precision-instrument feel of the interface and ensures maximum usable surface area for dense data points.

- **Base Components (Inputs, Metric Badges, Buttons, Tabs)**: `0.25rem` (`4px`). Retains sharp perimeter definitions suitable for compact heights (28px - 32px standard form controls).
- **Cards & Data Grid Enclosures (`rounded-lg`)**: `0.5rem` (`8px`). Subtly rounds macro bounding containers without wasting peripheral pixel space.
- **Dialogs & Flyout Drawers (`rounded-xl`)**: `0.75rem` (`12px`). Delivers a gentle structural cue indicating a breakout layer above the core analytics canvas.
- **Pills**: Disallowed for primary interactive controls; reserved strictly for status chips, micro-indicators, and tag badges where full pill border-radius creates instant semantic divergence from actionable buttons.

## Components

### Buttons
- **Primary (Intervention / Action)**: Solid `#8B5CF6` background, `#FFFFFF` text, `0.25rem` radius. In hover: `#A78BFA`. Active: `#7C3AED`. Height: `32px` (compact) or `36px` (default). Padding: `0 12px`.
- **Secondary / Ghost**: Transparent background, border `1px solid #282E3C`, `#F9FAFB` text. Hover: `#1F2430` background, border `#3B4457`.
- **Subtle Icon Triggers**: Borderless, `28px x 28px`, `#9CA3AF` glyph fill, transitioning to `#F9FAFB` on `#1F2430` background plate upon hover.

### Status Chips & Badges
- **Structure**: Height `20px`, padding `0 6px`, `JetBrains Mono`, `0.6875rem` size, uppercase.
- **Growth / Positive**: Background `rgba(16, 185, 129, 0.12)`, text `#10B981`, border `1px solid rgba(16, 185, 129, 0.25)`.
- **Drift / Warning**: Background `rgba(245, 158, 11, 0.12)`, text `#F59E0B`, border `1px solid rgba(245, 158, 11, 0.25)`.
- **Intervention Flag**: Background `rgba(139, 92, 246, 0.14)`, text `#A78BFA`, border `1px solid rgba(139, 92, 246, 0.3)`.

### Data Tables & Lists
- **Header**: Height `32px`, `#12151B` background, border-bottom `1px solid #282E3C`. Font: `0.6875rem` uppercase monospace, tracking `0.04em`, color `#9CA3AF`.
- **Row**: Height `36px` (compact mode) or `44px` (relaxed mode). Base `#181C24`, alternate rows un-striped. Hover: `#1F2430`. Border-bottom `1px solid rgba(40, 46, 60, 0.6)`.
- **Alignment**: Numeric data right-aligned via `JetBrains Mono`; labels and cohort keys left-aligned via `Inter`.

### Form Inputs & Selectors
- **Input Fields**: Height `32px`, background `#0B0D11`, border `1px solid #282E3C`, text `#F9FAFB`, placeholder `#6B7280`. Focused state: border `#8B5CF6`, subtle ambient ring `0 0 0 1px #8B5CF6`. No heavy focus offset glows.

### Cards & KPI Containers
- **Surfaces**: `#181C24` fill enclosed by `1px solid #282E3C`.
- **Padding Structure**: `0.75rem` (`12px`) interior inset for standard compact metric cards; `1rem` (`16px`) for primary time-series and scatter chart views.
- **Header Structure**: Borderless upper title block housing title (`title-sm`), secondary spark-trend indicator, and contextual kebab menu.

### Data Visualization Accents
- **Line & Area Curves**: Stroke width strictly `1.5px` or `2px`. Fill gradients drop from `15%` opacity at baseline down to `0%` transparent to prevent visual mass collision.
- **Crosshairs & Tooltips**: Crosshair uses `1px` dashed `#6B7280`. Tooltip cards render with `#1F2430` background, `1px solid #3B4457`, and monospaced key-value readouts.