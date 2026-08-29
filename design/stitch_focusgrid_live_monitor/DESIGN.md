---
name: Lumina Dashboard
colors:
  surface: '#f9f9ff'
  surface-dim: '#d8d9e3'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fd'
  surface-container: '#ecedf7'
  surface-container-high: '#e6e7f2'
  surface-container-highest: '#e1e2ec'
  on-surface: '#191b23'
  on-surface-variant: '#424754'
  inverse-surface: '#2e3038'
  inverse-on-surface: '#eff0fa'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#924700'
  on-tertiary: '#ffffff'
  tertiary-container: '#b75b00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#f9f9ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ec'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 24px
  gutter: 20px
  card-gap: 24px
---

## Brand & Style

The design system is centered on a **Modern Glassmorphic** aesthetic tailored specifically for a high-performance Teacher Dashboard. The brand personality is professional, transparent, and focused. It aims to reduce the cognitive load of educators by using depth and translucency to establish a clear information hierarchy. 

The visual style utilizes "frosted glass" surfaces that sit atop soft, organic background gradients. This creates a sense of lightness and spatial depth, moving away from the heavy, boxed-in feel of traditional enterprise software. The interface should feel like a clean, well-organized physical workspace illuminated by soft natural light.

## Colors

This design system uses a palette that emphasizes clarity and calm. The background is not a flat color but a subtle linear gradient to give the glass effects something to interact with. 

- **Primary Accent:** Vibrant Blue is used for primary actions, active states, and progress indicators.
- **Surface Colors:** Surfaces are built using semi-transparent white fills. 
- **Functional Colors:** Emerald, Amber, and Crimson are reserved strictly for status communication (e.g., student attendance, grading alerts, and urgent notifications).
- **Neutrals:** Slate grays are used for secondary text and icons to maintain a high level of legibility against translucent backgrounds.

## Typography

Inter is the sole typeface for the design system, chosen for its exceptional legibility on digital screens and its neutral, systematic character.

- **Scale:** Use `display-lg` for dashboard overviews (e.g., total student count).
- **Hierarchy:** Use `label-caps` for small metadata, table headers, and category tags to differentiate from body content.
- **Contrast:** High weight contrast (Bold vs. Regular) is preferred over color contrast to maintain accessibility on translucent backgrounds.

## Layout & Spacing

The layout follows a **Fluid Grid** model. The dashboard utilizes a persistent sidebar on the left (280px) with a flexible main content area.

- **Rhythm:** An 8px base grid governs all padding and margins.
- **Margins:** Main page margins are set to 32px on desktop and 16px on mobile.
- **Reflow:** On mobile devices, the sidebar collapses into a bottom navigation bar or a hamburger menu, and the 3-column grid stacks into a single column.

## Elevation & Depth

Depth is the core of this design system. It is achieved through three layers:
1.  **The Canvas (Bottom):** A soft gradient background.
2.  **The Glass Layer (Middle):** Translucent panels with a `backdrop-filter: blur(20px)` and a white semi-transparent fill.
3.  **The Floating Layer (Top):** Active modals or tooltips that feature a slightly higher opacity and a subtle ambient shadow (`0 20px 40px rgba(0,0,0,0.05)`).

All glass panels must have a 1px solid border with low opacity (`glass_stroke`) to define their edges against the background.

## Shapes

The design system uses a "Rounded" (level 2) language. 
- **Standard Cards/Inputs:** 0.5rem (8px).
- **Large Sections/Sidebars:** 1rem (16px).
- **Buttons/Chips:** Full pill-shaped rounding (999px) to contrast against the more structural rectangular cards.

## Components

### Glass Cards
The primary container for dashboard widgets. Must feature the `backdrop-filter`, a 1px internal border, and 24px internal padding. Avoid heavy drop shadows; use the border and blur to create separation.

### Frosted Sidebar
A full-height vertical panel on the left. It should have a higher blur radius (30px) and a slightly darker tint than standard cards to anchor the navigation.

### Circular Progress & Sparklines
- **Progress Charts:** Use the Primary Blue for the track. For student performance, use the Status colors. The center of the circle should be transparent to show the background blur.
- **Sparklines:** Used inside small glass cards to show attendance trends. Use a 2px stroke width with no fill, utilizing the primary or status colors.

### Buttons
- **Primary:** Solid #3B82F6 with white text.
- **Secondary:** A "glass button" style—semi-transparent white fill with a subtle border.

### Input Fields
Inputs should be treated as "etched" into the glass. Use a slightly lower opacity fill than the card it sits on, with a subtle 1px border that brightens on focus.