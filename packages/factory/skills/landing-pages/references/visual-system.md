# Visual System Reference

> **Usage:** When Scout handover (`factory-handover.yaml`) is available, use its `visual_consensus` recommendations as the starting point. This document provides detailed palettes for customization and serves as fallback when no research data exists.

Complete color palettes, typography, and spacing guidelines by product category.

## Color Palettes by Category

### AI/Developer Tools

Dark mode dominant. Technical sophistication. High contrast.

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0a;      /* Near black */
  --bg-secondary: #171717;    /* Card backgrounds */
  --bg-tertiary: #262626;     /* Elevated surfaces */
  
  /* Text */
  --text-primary: #fafafa;    /* Primary text */
  --text-secondary: #a3a3a3;  /* Secondary/muted */
  --text-tertiary: #737373;   /* Disabled/hints */
  
  /* Accents - choose ONE */
  --accent-emerald: #10b981;  /* AI, automation */
  --accent-teal: #14b8a6;     /* Data, analytics */
  --accent-purple: #a855f7;   /* Developer tools */
  --accent-blue: #3b82f6;     /* APIs, infrastructure */
  
  /* Borders */
  --border-subtle: #262626;
  --border-default: #404040;
}
```

**Usage notes:**
- Accent color appears on CTAs, links, and key UI elements only
- Use `--bg-secondary` for cards, code blocks
- Social proof badges can use slightly muted accent

### B2B SaaS

Light mode. Professional. Trustworthy. Clean.

```css
:root {
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;    /* Gray-50 */
  --bg-tertiary: #f3f4f6;     /* Gray-100 */
  
  /* Text */
  --text-primary: #111827;    /* Gray-900 */
  --text-secondary: #4b5563;  /* Gray-600 */
  --text-tertiary: #9ca3af;   /* Gray-400 */
  
  /* Accents - choose ONE */
  --accent-indigo: #4f46e5;   /* Default SaaS */
  --accent-blue: #2563eb;     /* Enterprise */
  --accent-violet: #7c3aed;   /* Modern SaaS */
  
  /* Borders */
  --border-subtle: #f3f4f6;
  --border-default: #e5e7eb;
}
```

**Usage notes:**
- Hero can use subtle gradient: `bg-gradient-to-b from-white to-gray-50`
- Feature sections alternate white/gray backgrounds
- Trust badges (SOC2, GDPR) use muted grays

### Consumer Apps

Light or gradient. Vibrant. Approachable. Playful.

```css
:root {
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #fefce8;    /* Warm tint */
  --bg-gradient: linear-gradient(135deg, #fef3c7 0%, #fce7f3 100%);
  
  /* Text */
  --text-primary: #111827;
  --text-secondary: #4b5563;
  
  /* Accents - vibrant options */
  --accent-amber: #f59e0b;
  --accent-rose: #f43f5e;
  --accent-orange: #f97316;
  --accent-pink: #ec4899;
  
  /* Borders */
  --border-subtle: #fef3c7;
  --border-default: #fde68a;
}
```

**Usage notes:**
- Rounded corners more prominent (16px+)
- Can use playful illustrations, emoji
- Photography of real people works well

### Creator Tools

Dark or editorial. Bold typography. Dramatic.

```css
:root {
  /* Backgrounds */
  --bg-primary: #18181b;      /* Zinc-900 */
  --bg-secondary: #27272a;    /* Zinc-800 */
  --bg-accent: #09090b;       /* Near black for contrast */
  
  /* Text */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;  /* Zinc-400 */
  
  /* Accents */
  --accent-purple: #a855f7;
  --accent-fuchsia: #d946ef;
  --accent-cyan: #06b6d4;
  
  /* Gradients for backgrounds */
  --gradient-cosmic: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
}
```

**Usage notes:**
- Large, dramatic typography
- Can use creative layouts (asymmetry, overlap)
- Video/motion more acceptable

## Typography System

### Font Pairings by Category

**AI/Developer Tools:**
```css
--font-headline: 'Inter', 'SF Pro Display', system-ui;  /* Or IBM Plex Sans */
--font-body: 'Inter', system-ui;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```
Use monospace for technical terms, stats, code references.

**B2B SaaS:**
```css
--font-headline: 'Inter', system-ui;  /* Clean and professional */
--font-body: 'Inter', system-ui;
/* Alternative: Plus Jakarta Sans for modern feel */
```

**Consumer Apps:**
```css
--font-headline: 'Plus Jakarta Sans', system-ui;  /* Friendly */
--font-body: 'Inter', system-ui;
/* Alternative: Nunito for extra friendly feel */
```

**Creator Tools:**
```css
--font-headline: 'Space Grotesk', system-ui;  /* Or Clash Display */
--font-body: 'Inter', system-ui;
/* For editorial: Add serif like 'Playfair Display' or 'Fraunces' */
```

### Type Scale

```css
/* Headlines */
.headline-xl { font-size: 72px; line-height: 1.1; letter-spacing: -0.02em; font-weight: 700; }
.headline-lg { font-size: 48px; line-height: 1.15; letter-spacing: -0.02em; font-weight: 700; }
.headline-md { font-size: 36px; line-height: 1.2; letter-spacing: -0.01em; font-weight: 600; }
.headline-sm { font-size: 24px; line-height: 1.3; font-weight: 600; }

/* Body */
.body-lg { font-size: 20px; line-height: 1.6; }
.body-md { font-size: 18px; line-height: 1.6; }
.body-sm { font-size: 16px; line-height: 1.6; }

/* Utility */
.label { font-size: 14px; line-height: 1.4; font-weight: 500; letter-spacing: 0.01em; }
.caption { font-size: 12px; line-height: 1.4; }
```

### Mobile Adjustments

```css
@media (max-width: 768px) {
  .headline-xl { font-size: 48px; }
  .headline-lg { font-size: 36px; }
  .headline-md { font-size: 28px; }
  .body-lg { font-size: 18px; }
}
```

## Spacing System

Use Tailwind spacing scale. Key patterns:

### Section Spacing
```
Desktop: py-24 (96px vertical padding)
Mobile:  py-16 (64px vertical padding)
```

### Component Spacing
```
Between major elements: gap-12 or gap-16
Between related elements: gap-6 or gap-8
Between text elements: gap-4
```

### Content Width
```
Text content: max-w-3xl (48rem / 768px)
Layout content: max-w-6xl (72rem / 1152px)
Full bleed: max-w-none with px-6 or px-8
```

### Container Pattern
```html
<section class="py-24 px-6">
  <div class="max-w-6xl mx-auto">
    <!-- content -->
  </div>
</section>
```

## Border Radius

| Category | Card Radius | Button Radius | Input Radius |
|----------|-------------|---------------|--------------|
| AI/Dev | 8px | 6px | 6px |
| B2B SaaS | 12px | 8px | 8px |
| Consumer | 16px | 9999px (pill) | 12px |
| Creator | 8-16px | 8px | 8px |

## Shadow System

### Light Mode
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
```

### Dark Mode
```css
/* Use borders instead of shadows, or glow effects */
--glow-accent: 0 0 20px rgb(16 185 129 / 0.3);  /* Emerald glow */
--border-glow: 0 0 0 1px rgb(255 255 255 / 0.1);
```

## Button Styles

### Primary CTA
```css
.btn-primary {
  background: var(--accent);
  color: white;
  padding: 12px 24px;
  font-weight: 600;
  border-radius: var(--radius-button);
  transition: all 150ms ease;
}
.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
```

### Secondary CTA
```css
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  padding: 12px 24px;
  font-weight: 500;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-button);
}
```

### Ghost (for dark backgrounds)
```css
.btn-ghost {
  background: rgb(255 255 255 / 0.1);
  color: white;
  border: 1px solid rgb(255 255 255 / 0.2);
}
```

## Dark Mode Considerations

For AI/Dev and Creator categories, dark mode is default. Key principles:

1. **Never use pure black** (#000000) - use #0a0a0a or similar
2. **Reduce white brightness** - use #fafafa instead of #ffffff for text
3. **Borders over shadows** - shadows don't work well on dark backgrounds
4. **Accent glow** - subtle glow on accent-colored elements adds depth
5. **Reduce image brightness** - `filter: brightness(0.9)` on light images
