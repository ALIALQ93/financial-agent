---
name: Pro-Ledger Intelligence
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#47464c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#78767d'
  outline-variant: '#c8c5cd'
  surface-tint: '#5d5c74'
  primary: '#00000b'
  on-primary: '#ffffff'
  primary-container: '#1a1a2e'
  on-primary-container: '#83829b'
  inverse-primary: '#c6c4df'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fd'
  on-secondary-container: '#57657b'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#009768'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e0fc'
  primary-fixed-dim: '#c6c4df'
  on-primary-fixed: '#1a1a2e'
  on-primary-fixed-variant: '#45455b'
  secondary-fixed: '#d5e3fd'
  secondary-fixed-dim: '#b9c7e0'
  on-secondary-fixed: '#0d1c2f'
  on-secondary-fixed-variant: '#3a485c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
  surface-light: '#F8FAFC'
  surface-dark: '#0F172A'
  accent-gold: '#E8B84B'
  data-up: '#10B981'
  data-down: '#EF4444'
typography:
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  data-mono:
    fontFamily: monospace
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1440px
---

## Brand & Style

The brand personality of the design system is rooted in precision, analytical clarity, and institutional trust. It is designed for high-stakes financial environments where data density must coexist with visual calm. The target audience includes financial analysts, portfolio managers, and executive stakeholders who require immediate insights without cognitive overload.

The design style is **Corporate / Modern**. It emphasizes a minimalist aesthetic through generous whitespace, a structured grid, and a sophisticated interplay between deep navy tones and vibrant action accents. The interface avoids unnecessary decoration, focusing instead on structural integrity and clear information hierarchy to evoke a sense of reliability and forward-thinking intelligence.

## Colors

The color strategy centers on a "Deep Finance" palette. The primary color is a rich, professional navy (`#1A1A2E`), providing a grounded foundation for both light and dark modes. Charcoal grays are utilized for secondary text and structural borders to maintain low-tension contrast.

The emerald green accent (`#10B981`) is reserved strictly for key call-to-actions, primary interactive states, and positive financial trends. For data visualization, a secondary gold (`#E8B84B`) from the legacy palette is retained for cautionary alerts or specific highlighting. 

In light mode, surfaces use a clean off-white (`#F8FAFC`) to reduce eye strain. In dark mode, the interface shifts to a layered slate-to-navy hierarchy, ensuring that data tables and charts remain the focal point.

## Typography

The design system utilizes **IBM Plex Sans** for its exceptional legibility in both English and Arabic, as well as its technical, "engineered" feel that suits financial analysis. 

Headlines are set with slight negative letter-spacing and a semi-bold weight to command authority without being aggressive. Body text is optimized for long-form reading and data scanning, utilizing generous line heights. A specific `data-mono` role is defined for numerical figures in tables to ensure tabular lining and easy comparison of values. Labels use a slightly heavier weight and uppercase styling to provide clear categorization for metadata and table headers.

## Layout & Spacing

The layout is built on a 12-column fluid grid system that prioritizes data legibility. 

- **Desktop:** 12 columns with 24px gutters and 48px outer margins. Content is housed in a centered container with a maximum width of 1440px.
- **Tablet:** 8 columns with 16px gutters and 32px margins.
- **Mobile:** 4 columns with 16px gutters and 16px margins.

Spacing follows a 4px base unit (4, 8, 12, 16, 24, 32, 48, 64). Large financial dashboards should utilize the 48px and 64px increments to separate major functional modules, while internal card components should use tighter 12px or 16px spacing to maintain a cohesive data-to-action relationship.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** supplemented by **Ambient Shadows**. 

Surfaces are elevated using a tiered background approach: the base canvas is the lightest/darkest (depending on mode), while cards and interactive panels sit one level above. Shadows are intentionally subtle—highly diffused with low opacity (4-8%)—to simulate a soft lift rather than a harsh drop. 

In dark mode, depth is conveyed primarily through color luminance (lighter slates for higher layers) rather than heavy shadows. 1px borders in a low-contrast neutral shade are used to define boundaries for data tables and input fields, ensuring clarity without adding visual noise.

## Shapes

The design system employs a **Soft** shape language. This level of roundedness (0.25rem for standard elements) strikes a balance between the rigid precision of traditional finance and the approachability of modern AI-driven tools. 

- **Buttons & Inputs:** Use the standard `rounded` (4px) setting.
- **Cards & Modals:** Use `rounded-lg` (8px) to soften the large surface areas.
- **Data Tags/Chips:** Use `rounded-xl` (12px) or full pill shapes to distinguish them from actionable buttons.

## Components

### Buttons
Primary buttons use the Emerald Green background with white text. Hover states should darken the green slightly. Secondary buttons use a transparent background with a 1px charcoal border. All buttons have a 48px minimum height for touch readiness and a clear focus state using a 2px offset ring.

### Cards
Financial cards are the primary container. They feature a white (light mode) or slate-navy (dark mode) background, an 8px corner radius, and a subtle 1px border. Padding inside cards is a consistent 24px.

### Data Tables
Tables are clean with no vertical borders. Headers use the `label-lg` typography with a subtle bottom border. Row striping (zebra) is applied using a 2% opacity shift of the neutral color to assist in horizontal scanning.

### Input Fields
Inputs use a 1px border that thickens and changes to the primary navy color on focus. Labels are always persistent above the field using `label-md`.

### Charts & Visualization
Graphs should use the emerald, gold, and vibrant blue for series. Grid lines in charts should be kept at 10% opacity of the neutral color to remain functional but unobtrusive.

### Interactive Elements
Financial "pills" or chips for filters should toggle between a light gray background and the primary navy background to indicate active states.