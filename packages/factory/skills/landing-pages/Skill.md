---
name: landing-page
description: Build pre-launch landing pages for product concept validation. Use when Factory agent needs to create Astro sites for demand validation, waitlist capture, or early access signups. Reads Scout handover for market research and competitor patterns. Covers hero selection, visual system, component assembly, copy framework, and conversion optimization. NOT for product interfaces or post-launch pages.
---

# Pre-Launch Landing Page Builder

Build Astro landing pages for product concept validation within the Pagelane Site Blueprint.

## Scope

**This skill covers:** Pre-launch pages for validating product demand before building.
- Waitlist/email capture pages
- Coming soon pages  
- Early access signup pages
- Concept validation landing pages

**This skill does NOT cover:** Product interfaces disguised as landing pages (prompt-as-hero patterns like Manus, Bolt.new) - those require a working product backend.

## Workflow

1. **Read** Scout handover → get research-backed inputs
2. **Decide** visual direction → based on research + differentiation strategy
3. **Select** hero pattern → based on available assets
4. **Assemble** components → from checklist
5. **Apply** copy framework → headlines, CTAs, social proof
6. **Validate** against Site Blueprint requirements

## Step 1: Read Scout Handover

Look for `factory-handover.yaml` in the Scout output. This contains:

```yaml
# Key fields to extract:
product:
  category: "ai-dev-tool" | "b2b-saas" | "consumer-app" | "creator-tool"
  positioning: "One-line positioning"

customer_segments:
  primary: { name, characteristics }
  secondary: { name, characteristics }

visual_consensus:
  recommended_mode: "dark" | "light"
  recommended_accent: "color name"
  hero_recommendation: "screenshot" | "video" | "classic"
  patterns_observed: [{ pattern, frequency }]

differentiation_opportunities:
  visual: ["List of ways to stand out"]
  
pricing_intelligence:
  recommended_model: "freemium" | "paid" | "enterprise"
  entry_price_benchmark: "$X/mo"

social_proof_patterns:
  most_common: ["user-count", "logos", etc.]
```

**If handover is missing:** Fall back to Step 2 defaults, but flag that decisions are not research-backed.

## Step 2: Visual Direction Decision

Use Scout research to make informed choices:

### Option A: Align with Market (Red Ocean / Validation Focus)
Choose when: Testing demand in established market, want to look credible

→ Use `visual_consensus.recommended_mode`
→ Use `visual_consensus.recommended_accent`
→ Follow dominant `patterns_observed`

### Option B: Differentiate (Blue Ocean / Standout Focus)
Choose when: Market is crowded, competitors look identical, want to stand out

→ Check `differentiation_opportunities.visual`
→ Invert the dominant pattern (if 8/10 are dark, go light)
→ Use unexpected accent color

### Decision Framework

```
Is competitor visual landscape homogeneous (>70% same pattern)?
├── YES → Consider differentiation (Option B)
│         Ask: Will standing out help or hurt credibility?
└── NO  → Align with successful patterns (Option A)

Is this a technical/developer audience?
├── YES → Dark mode likely expected; differentiation risky
└── NO  → More freedom to experiment

Does Scout recommend differentiation?
├── YES → Follow their visual differentiation suggestions
└── NO  → Align with consensus
```

### Fallback Defaults (if no Scout handover)

| Category | Default Direction |
|----------|-------------------|
| **AI/Dev Tool** | Dark mode, emerald accent, monospace accents |
| **B2B SaaS** | Light mode, indigo accent, clean sans-serif |
| **Consumer App** | Light/gradient, vibrant accent, rounded UI |
| **Creator Tool** | Dark/editorial, purple accent, bold typography |

See `references/visual-system.md` for complete palettes when customizing.

## Step 3: Hero Pattern Selection

Check Scout's `visual_consensus.hero_recommendation` first, then choose based on available assets:

**Scout recommends "video" or "demo"?**
→ Use **Demo Hero**: Headline + subheadline + embedded video/GIF showing the product vision
→ If no video available, flag gap and fall back to next option

**Scout recommends "screenshot" or have strong visual asset?**
→ Use **Screenshot Hero**: Headline + subheadline + product mockup/screenshot

**Scout recommends "classic" or nothing available yet?**
→ Use **Classic Hero**: Headline + subheadline + CTA button + abstract illustration or gradient

**Have traction metrics from Scout's research?**
→ Use **Social Proof Hero**: Lead with metrics/logos, then headline + CTA
→ Use `social_proof_patterns.most_common` to decide what type of proof

See `references/components.md` for Astro component patterns for each hero type.

## Step 4: Component Assembly

### Required Components (Site Blueprint enforced)

- [ ] `@sites/seo` integration with `seo.config.yaml`
- [ ] `@sites/analytics` PostHog integration
- [ ] Email capture form → POST to Pulse `/api/emails/capture`
- [ ] Mobile responsive layout
- [ ] Accessible markup (semantic HTML, ARIA where needed)

### Standard Components (include unless reason to omit)

- [ ] Header: Logo + minimal nav (2-4 links max) + CTA button
- [ ] Hero section (pattern from Step 2)
- [ ] Value proposition (3-4 bullet points OR single paragraph)
- [ ] Social proof strip (logos, quotes, metrics, or "as seen in")
- [ ] Footer: Links + legal + copyright

### Optional Components (based on Scout brief)

- [ ] Feature grid (3-6 features with icons)
- [ ] How it works (3-4 numbered steps)
- [ ] FAQ section (4-8 questions)
- [ ] Pricing preview (if relevant for validation)
- [ ] Team/founder section (for trust building)
- [ ] Testimonial cards (if available)

See `references/components.md` for implementation patterns.

## Step 5: Copy Framework

### Use Scout Positioning

Start with `product.positioning` from Scout handover. This is the research-backed one-liner.

If adapting, keep aligned with validated customer segments:
- Primary segment: `customer_segments.primary.name`
- Their characteristics: `customer_segments.primary.characteristics`

### Headline Formula

Use one of these patterns:

1. **Outcome-focused**: "[Achieve X] without [pain point Y]"
2. **Category-defining**: "The [category] for [audience]"
3. **Contrast**: "[Old way] is dead. [New way] is here."
4. **Direct value**: "[Action verb] your [thing] in [timeframe]"

**Length**: 4-10 words. Shorter is better.

### Subheadline

Expand on the headline with specifics:
- What the product does (concretely)
- Who it's for
- Key differentiator

**Length**: 15-25 words. One or two sentences.

### CTA Language by Stage

| Stage | Primary CTA | Secondary CTA |
|-------|-------------|---------------|
| Early concept | "Join the waitlist" | "Learn more" |
| Building in public | "Get early access" | "Follow updates" |
| Beta ready | "Request beta access" | "See how it works" |
| Launch imminent | "Get started free" | "Book a demo" |

### Pricing Preview (if included)

Reference Scout's `pricing_intelligence`:
- Use `recommended_model` (freemium, paid, etc.)
- Benchmark against `entry_price_benchmark`
- Note competitor tier structures in `phase-2-research.yaml`

For pre-launch: Consider "Starting at $X/mo" teaser if price is validated.

### Urgency/Scarcity (use sparingly)

- Cohort limits: "Joining first 100 users"
- Timeline: "Launching Q1 2025"
- Exclusivity: "Invite-only beta"

**Avoid**: Countdown timers (0/15 top pages use them), fake scarcity, pressure tactics.

See `references/copy-examples.md` for real examples from high-traffic pages.

## Step 6: Validation Checklist

Before marking site as complete:

### Site Blueprint Compliance
- [ ] `@sites/seo` configured with meta, OG, structured data
- [ ] `@sites/analytics` PostHog events firing
- [ ] Email capture POSTs to Pulse API
- [ ] `wrangler.toml` configured for Cloudflare Workers
- [ ] `seo.config.yaml` complete

### Conversion Optimization
- [ ] Single clear primary CTA (repeated 2-3x on page)
- [ ] Email form above the fold OR sticky
- [ ] Value proposition clear within 5 seconds
- [ ] Social proof visible within first scroll
- [ ] Mobile-first responsive design

### Technical Quality
- [ ] Lighthouse score ≥ 90
- [ ] No layout shift on load
- [ ] Images optimized (WebP, lazy loading)
- [ ] Semantic HTML structure

## Visual Quick Reference

### Color Defaults by Category

```
AI/Dev Tool:    bg:#0a0a0a  text:#fafafa  accent:#10b981 (emerald)
B2B SaaS:       bg:#ffffff  text:#1f2937  accent:#4f46e5 (indigo)
Consumer:       bg:#ffffff  text:#111827  accent:#f59e0b (amber)
Creator:        bg:#18181b  text:#fafafa  accent:#a855f7 (purple)
```

### Typography Defaults

```
Headlines:  Bold, 48-72px, tight tracking (-0.02em)
Subhead:    Medium, 20-24px, normal tracking
Body:       Regular, 16-18px, 1.6 line-height
```

### Spacing Scale (Tailwind)

```
Section padding:  py-24 (mobile: py-16)
Component gap:    gap-8 or gap-12
Max content:      max-w-3xl (text), max-w-6xl (layout)
```

## Anti-Patterns

Never do:
- Multiple competing CTAs in hero
- Countdown timers
- Generic stock photography
- Navigation with 6+ links
- Walls of text without hierarchy
- Prompt inputs without backend (prompt-as-hero requires working product)
- Lorem ipsum or placeholder content
- Auto-playing video with sound

## File Output

Factory produces these files per site:

```
apps/sites/site-{name}/
├── astro.config.mjs
├── wrangler.toml
├── seo.config.yaml
├── project.json
├── tsconfig.json
├── src/
│   ├── pages/index.astro
│   ├── layouts/Layout.astro
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Hero.astro
│   │   ├── EmailCapture.astro
│   │   ├── Features.astro (if needed)
│   │   ├── SocialProof.astro (if needed)
│   │   ├── FAQ.astro (if needed)
│   │   └── Footer.astro
│   ├── lib/
│   │   └── analytics.ts
│   └── styles/
│       └── global.css
└── public/
    ├── favicon.svg
    └── og-image.png (if provided)
```
