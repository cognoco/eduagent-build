# Component Reference

Astro component patterns for pre-launch landing pages. All components integrate with `@sites/analytics` and follow Site Blueprint requirements.

## Hero Patterns

### Classic Hero (No Product Assets)

Use when: No screenshots, demos, or videos available yet.

```astro
---
// src/components/Hero.astro
import EmailCapture from './EmailCapture.astro';

interface Props {
  headline: string;
  subheadline: string;
  ctaText?: string;
}

const { headline, subheadline, ctaText = "Join the waitlist" } = Astro.props;
---

<section class="relative py-24 px-6 overflow-hidden">
  <!-- Optional: Abstract background -->
  <div class="absolute inset-0 bg-gradient-to-b from-gray-50 to-white -z-10" />
  
  <div class="max-w-3xl mx-auto text-center">
    <h1 class="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
      {headline}
    </h1>
    <p class="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
      {subheadline}
    </p>
    <EmailCapture buttonText={ctaText} />
  </div>
</section>
```

### Screenshot Hero

Use when: Have mockup, screenshot, or product visualization.

```astro
---
// src/components/HeroScreenshot.astro
import EmailCapture from './EmailCapture.astro';

interface Props {
  headline: string;
  subheadline: string;
  screenshotSrc: string;
  screenshotAlt: string;
}

const { headline, subheadline, screenshotSrc, screenshotAlt } = Astro.props;
---

<section class="py-24 px-6">
  <div class="max-w-6xl mx-auto">
    <div class="text-center mb-16">
      <h1 class="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
        {headline}
      </h1>
      <p class="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
        {subheadline}
      </p>
      <EmailCapture />
    </div>
    
    <!-- Screenshot with shadow/frame -->
    <div class="relative">
      <div class="absolute inset-0 bg-gradient-to-t from-gray-100 to-transparent rounded-xl" />
      <img 
        src={screenshotSrc} 
        alt={screenshotAlt}
        class="rounded-xl shadow-2xl border border-gray-200"
        loading="eager"
      />
    </div>
  </div>
</section>
```

### Demo Hero (Video/GIF)

Use when: Have video demo or animated GIF showing product vision.

```astro
---
// src/components/HeroDemo.astro
import EmailCapture from './EmailCapture.astro';

interface Props {
  headline: string;
  subheadline: string;
  videoSrc?: string;
  gifSrc?: string;
  posterSrc?: string;
}

const { headline, subheadline, videoSrc, gifSrc, posterSrc } = Astro.props;
---

<section class="py-24 px-6">
  <div class="max-w-6xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <h1 class="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
          {headline}
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          {subheadline}
        </p>
        <EmailCapture />
      </div>
      
      <div class="relative rounded-xl overflow-hidden shadow-2xl">
        {videoSrc ? (
          <video 
            autoplay 
            loop 
            muted 
            playsinline
            poster={posterSrc}
            class="w-full"
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : gifSrc ? (
          <img src={gifSrc} alt="Product demo" class="w-full" loading="eager" />
        ) : null}
      </div>
    </div>
  </div>
</section>
```

### Social Proof Hero

Use when: Have traction metrics, notable users, or press coverage.

```astro
---
// src/components/HeroSocialProof.astro
import EmailCapture from './EmailCapture.astro';

interface Props {
  headline: string;
  subheadline: string;
  metrics?: Array<{ value: string; label: string }>;
  logos?: Array<{ src: string; alt: string }>;
}

const { headline, subheadline, metrics, logos } = Astro.props;
---

<section class="py-24 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <!-- Lead with proof -->
    {metrics && (
      <div class="flex justify-center gap-12 mb-12">
        {metrics.map(m => (
          <div>
            <div class="text-4xl font-bold text-gray-900">{m.value}</div>
            <div class="text-sm text-gray-500">{m.label}</div>
          </div>
        ))}
      </div>
    )}
    
    {logos && (
      <div class="flex justify-center items-center gap-8 mb-12 opacity-60">
        {logos.map(l => (
          <img src={l.src} alt={l.alt} class="h-8" />
        ))}
      </div>
    )}
    
    <h1 class="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
      {headline}
    </h1>
    <p class="text-xl text-gray-600 mb-10">
      {subheadline}
    </p>
    <EmailCapture />
  </div>
</section>
```

## Email Capture

Core conversion component. Always POST to Pulse API.

```astro
---
// src/components/EmailCapture.astro
interface Props {
  buttonText?: string;
  placeholder?: string;
  siteId: string;
}

const { 
  buttonText = "Join waitlist", 
  placeholder = "Enter your email",
  siteId 
} = Astro.props;

const pulseApiUrl = import.meta.env.PUBLIC_PULSE_API_URL || 'https://pulse.pagelane.dev';
---

<form 
  id="email-capture" 
  class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
  data-site-id={siteId}
>
  <input
    type="email"
    name="email"
    required
    placeholder={placeholder}
    class="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
  />
  <button
    type="submit"
    class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
  >
    {buttonText}
  </button>
</form>

<div id="email-success" class="hidden text-center mt-4">
  <p class="text-green-600 font-medium">You're on the list! We'll be in touch.</p>
</div>

<div id="email-error" class="hidden text-center mt-4">
  <p class="text-red-600">Something went wrong. Please try again.</p>
</div>

<script define:vars={{ pulseApiUrl }}>
  const form = document.getElementById('email-capture');
  const successEl = document.getElementById('email-success');
  const errorEl = document.getElementById('email-error');
  
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const email = formData.get('email');
    const siteId = form.dataset.siteId;
    
    try {
      const res = await fetch(`${pulseApiUrl}/api/emails/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          site_id: siteId,
          email,
          language: navigator.language,
          source: document.referrer || 'direct'
        })
      });
      
      if (res.ok) {
        form.classList.add('hidden');
        successEl?.classList.remove('hidden');
        
        // Track conversion with PostHog
        window.posthog?.capture('email_signup', { email_domain: email.split('@')[1] });
      } else {
        throw new Error('Submission failed');
      }
    } catch (err) {
      errorEl?.classList.remove('hidden');
      setTimeout(() => errorEl?.classList.add('hidden'), 3000);
    }
  });
</script>
```

## Header

Minimal navigation. Logo + few links + CTA.

```astro
---
// src/components/Header.astro
interface Props {
  logoSrc?: string;
  logoText?: string;
  navLinks?: Array<{ href: string; label: string }>;
  ctaText?: string;
  ctaHref?: string;
}

const { 
  logoSrc, 
  logoText = "Product", 
  navLinks = [],
  ctaText = "Get early access",
  ctaHref = "#signup"
} = Astro.props;
---

<header class="py-4 px-6 border-b border-gray-100">
  <nav class="max-w-6xl mx-auto flex items-center justify-between">
    <a href="/" class="flex items-center gap-2">
      {logoSrc ? (
        <img src={logoSrc} alt={logoText} class="h-8" />
      ) : (
        <span class="text-xl font-bold">{logoText}</span>
      )}
    </a>
    
    <div class="hidden md:flex items-center gap-8">
      {navLinks.map(link => (
        <a href={link.href} class="text-gray-600 hover:text-gray-900 transition-colors">
          {link.label}
        </a>
      ))}
    </div>
    
    <a 
      href={ctaHref}
      class="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
    >
      {ctaText}
    </a>
  </nav>
</header>
```

## Features Grid

3-6 features with icons. Keep descriptions short.

```astro
---
// src/components/Features.astro
interface Feature {
  icon: string;  // Emoji or icon component
  title: string;
  description: string;
}

interface Props {
  headline?: string;
  features: Feature[];
}

const { headline = "Why choose us", features } = Astro.props;
---

<section class="py-24 px-6 bg-gray-50">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-16">{headline}</h2>
    
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      {features.map(f => (
        <div class="p-6 bg-white rounded-xl border border-gray-100">
          <div class="text-3xl mb-4">{f.icon}</div>
          <h3 class="text-lg font-semibold mb-2">{f.title}</h3>
          <p class="text-gray-600">{f.description}</p>
        </div>
      ))}
    </div>
  </div>
</section>
```

## Social Proof Strip

Logos, testimonials, or metrics. Flexible layout.

```astro
---
// src/components/SocialProof.astro
interface Props {
  variant: 'logos' | 'metrics' | 'testimonial';
  logos?: Array<{ src: string; alt: string }>;
  metrics?: Array<{ value: string; label: string }>;
  testimonial?: { quote: string; author: string; role: string; avatar?: string };
}

const { variant, logos, metrics, testimonial } = Astro.props;
---

<section class="py-16 px-6 border-y border-gray-100">
  <div class="max-w-6xl mx-auto">
    {variant === 'logos' && logos && (
      <div class="flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
        <span class="text-sm text-gray-400 w-full text-center mb-4">Trusted by teams at</span>
        {logos.map(l => (
          <img src={l.src} alt={l.alt} class="h-8 opacity-50 hover:opacity-100 transition-opacity" />
        ))}
      </div>
    )}
    
    {variant === 'metrics' && metrics && (
      <div class="flex justify-center gap-16">
        {metrics.map(m => (
          <div class="text-center">
            <div class="text-4xl font-bold text-gray-900">{m.value}</div>
            <div class="text-sm text-gray-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>
    )}
    
    {variant === 'testimonial' && testimonial && (
      <figure class="max-w-2xl mx-auto text-center">
        <blockquote class="text-xl text-gray-700 mb-6">
          "{testimonial.quote}"
        </blockquote>
        <figcaption class="flex items-center justify-center gap-3">
          {testimonial.avatar && (
            <img src={testimonial.avatar} alt="" class="w-10 h-10 rounded-full" />
          )}
          <div class="text-left">
            <div class="font-medium">{testimonial.author}</div>
            <div class="text-sm text-gray-500">{testimonial.role}</div>
          </div>
        </figcaption>
      </figure>
    )}
  </div>
</section>
```

## FAQ Section

Expandable accordion. Keep to 4-8 questions.

```astro
---
// src/components/FAQ.astro
interface FAQItem {
  question: string;
  answer: string;
}

interface Props {
  headline?: string;
  items: FAQItem[];
}

const { headline = "Frequently asked questions", items } = Astro.props;
---

<section class="py-24 px-6">
  <div class="max-w-3xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">{headline}</h2>
    
    <div class="divide-y divide-gray-200">
      {items.map((item, i) => (
        <details class="group py-4" open={i === 0}>
          <summary class="flex justify-between items-center cursor-pointer list-none">
            <span class="font-medium text-gray-900">{item.question}</span>
            <span class="ml-4 flex-shrink-0 text-gray-400 group-open:rotate-180 transition-transform">
              ↓
            </span>
          </summary>
          <p class="mt-4 text-gray-600">{item.answer}</p>
        </details>
      ))}
    </div>
  </div>
</section>
```

## Footer

Simple footer with links and legal.

```astro
---
// src/components/Footer.astro
interface Props {
  companyName: string;
  links?: Array<{ href: string; label: string }>;
  socialLinks?: Array<{ href: string; icon: string; label: string }>;
}

const { companyName, links = [], socialLinks = [] } = Astro.props;
const year = new Date().getFullYear();
---

<footer class="py-12 px-6 border-t border-gray-100">
  <div class="max-w-6xl mx-auto">
    <div class="flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="text-sm text-gray-500">
        © {year} {companyName}. All rights reserved.
      </div>
      
      <div class="flex items-center gap-6">
        {links.map(l => (
          <a href={l.href} class="text-sm text-gray-500 hover:text-gray-900">
            {l.label}
          </a>
        ))}
      </div>
      
      {socialLinks.length > 0 && (
        <div class="flex items-center gap-4">
          {socialLinks.map(s => (
            <a href={s.href} aria-label={s.label} class="text-gray-400 hover:text-gray-600">
              {s.icon}
            </a>
          ))}
        </div>
      )}
    </div>
  </div>
</footer>
```

## Dark Mode Variants

For AI/Dev and Creator categories, use dark variants:

```astro
---
// Example: Dark Hero variant
// Add to component or use Tailwind dark: prefix
---

<section class="py-24 px-6 bg-zinc-950 text-white">
  <div class="max-w-3xl mx-auto text-center">
    <h1 class="text-5xl md:text-6xl font-bold tracking-tight text-white mb-6">
      <slot name="headline" />
    </h1>
    <p class="text-xl text-zinc-400 mb-10">
      <slot name="subheadline" />
    </p>
    <slot name="cta" />
  </div>
</section>
```

Dark email input:
```css
input {
  @apply bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500;
}
input:focus {
  @apply ring-emerald-500 border-transparent;
}
button {
  @apply bg-emerald-600 hover:bg-emerald-500;
}
```
