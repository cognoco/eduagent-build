---
name: assumption-breaker
description: >
  Adversarial code review that finds bugs hiding in broken runtime assumptions.
  Use this skill whenever reviewing code, PRs, components, or screens — especially
  for mobile/cross-platform apps (React Native, Expo, Flutter, etc.) but applicable
  to any codebase. Triggers on: "review this code", "check for issues", "review my PR",
  "what could go wrong", "find bugs", "is this safe to ship", or any code review context.
  Also use when the user shares a component or screen and asks for feedback, even casually.
  This skill catches the class of bugs that pass normal code review because the code looks
  correct in isolation — the bugs that only surface when runtime context breaks the code's
  assumptions.
---

# Assumption-Breaker Code Review

## What this skill is for

Standard code review asks: "Is this code correct?" This skill asks the harder question: **"In what context does this correct code fail?"**

Most shipped bugs aren't wrong code — they're correct code running in an environment it didn't expect. A `router.back()` call is correct code, but it silently does nothing if the user arrived via deep link and there's no navigation history. A dropdown component works perfectly, but if it renders inside a `ScrollView`, the scroll container intercepts its touch events. A `.find()` call is fine — until the API returns `undefined` instead of an array.

These bugs survive code review because each line looks reasonable in isolation. They only break when you consider the runtime context the code will actually run in. Your job is to be that adversarial context.

## How to use this skill

When reviewing code, make **two passes**:

### Pass 1: Standard review (brief)
Do your normal code review — structure, naming, types, logic. Keep it concise. This is not the focus.

### Pass 2: Assumption audit (the real work)
For every function, handler, component, and data access in the code, ask: **"What is this assuming about its runtime environment, and when does that assumption break?"**

Work through these five categories systematically. Don't just list them as headings — actually examine the code for each one and report concrete findings.

---

## The five assumption categories

### 1. Navigation & routing assumptions

Code that navigates often assumes a "normal" app state that doesn't always exist.

**What to look for:**
- `router.back()`, `navigation.goBack()`, `history.back()`, or equivalent — these are silent no-ops when there's no history (deep link, push notification, direct URL, app restart, `router.replace()` before the call)
- `router.push()` to routes that may not be registered, or that depend on params the caller might not provide
- Navigation that depends on auth state, onboarding completion, or feature flags that might not be set yet
- Redirect chains that could loop (A redirects to B which redirects to A under certain conditions)

**The question to ask:** "If the user landed on this screen without going through the normal flow — via deep link, notification, URL paste, app restart, or OAuth callback — does every navigation call still work?"

**Example of a hidden bug:**
```jsx
// Looks correct — but if the user opened this screen from a deep link,
// there's no history. router.back() does nothing, the user is stuck.
<Button onPress={() => router.back()} title="Cancel" />
```

**Better pattern:** Fall back to a known route when there's no history:
```jsx
const safeGoBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/home');
  }
};
```

### 2. Layout & interaction assumptions

Components assume they control their own interaction space, but parent layouts can silently break that.

**What to look for:**
- Interactive elements (dropdowns, modals, popovers, tooltips) rendered inside scroll containers (`ScrollView`, `FlatList`, `overflow: auto` divs) — the scroll container can intercept touch/click events
- Absolutely positioned elements that rely on a specific parent for their coordinate system — if the parent layout changes, they appear in the wrong place
- `z-index` stacking that works in one context but fails when the component is placed elsewhere
- Gesture handlers that conflict with parent gesture handlers (e.g., a horizontal swipe inside a horizontal `ScrollView`)
- Touch targets that are too small or overlap with adjacent targets, especially on mobile

**The question to ask:** "If this component is placed inside a ScrollView, a modal, a tab navigator, or a deeply nested layout — do all its interactive elements still receive events correctly?"

**Example of a hidden bug:**
```jsx
// The ProfileSwitcher renders a dropdown, but it's inside a ScrollView.
// On web (and sometimes mobile), tapping dropdown options actually triggers
// the scroll area underneath instead.
<ScrollView>
  <ProfileSwitcher />  {/* dropdown clicks are intercepted */}
  <Content />
</ScrollView>
```

**Better pattern:** Keep interactive overlays outside the scroll container:
```jsx
<View>
  <ProfileSwitcher />  {/* header with dropdown sits outside scroll */}
  <ScrollView>
    <Content />
  </ScrollView>
</View>
```

### 3. Data shape & contract assumptions

Code that accesses data often assumes it arrives in the exact shape expected. APIs, caches, and async state can all violate this.

**What to look for:**
- `.find()`, `.map()`, `.filter()`, `.reduce()` called on values that could be `undefined`, `null`, or a non-array (object, string, number)
- Object property access chains without null checks (`user.profile.settings.theme`) — any link can be `undefined`
- Destructuring that assumes keys exist: `const { items } = response` where `response` might be `undefined` or have a different shape
- Array index access (`items[0]`) without checking if the array is empty
- Type assertions or casts that bypass runtime checks (`as SomeType`, `!` non-null assertion)
- Assumptions about enum/union completeness — what happens when the API adds a new status value the frontend doesn't handle?

**The question to ask:** "If the data is undefined, null, empty, a different type, or has an unexpected shape — does this code crash or degrade gracefully?"

**Example of a hidden bug:**
```jsx
// Looks fine if books is always an array. But if the API returns undefined,
// or a paginated response object, this crashes.
const book = books.find(b => b.id === bookId);
```

**Better pattern:**
```jsx
const book = Array.isArray(books) ? books.find(b => b.id === bookId) : undefined;
// or: (books ?? []).find(b => b.id === bookId)
```

### 4. Platform & environment assumptions

Code written and tested on one platform may behave differently on another. This applies to mobile vs web, iOS vs Android, dev vs production, and online vs offline.

**What to look for:**
- Native APIs used without web/platform fallbacks (`Camera`, `SecureStore`, `Haptics`, `Biometrics`, `NFC`, `Push Notifications`) — these crash or silently fail on unsupported platforms
- Touch vs. pointer event differences (hover states, long press, right click don't exist on mobile; web lacks native swipe gestures)
- Keyboard behavior differences (software keyboard on mobile resizes the viewport; physical keyboard on desktop doesn't)
- File system paths, storage APIs, or permissions models that differ across platforms
- Assumptions about screen size, safe areas, notches, or orientation that don't hold across devices
- `window`, `document`, `navigator` access that doesn't exist in SSR or native contexts

**The question to ask:** "If this code runs on the other platform (web if built for mobile, mobile if built for web, iOS if tested on Android) — what breaks?"

### 5. Timing & lifecycle assumptions

Code often assumes things happen in a specific order or that certain state is available at certain times.

**What to look for:**
- Component code that assumes data is loaded before first render (especially after navigation — the screen may mount before the data fetch completes)
- Effects or subscriptions that don't handle the component unmounting mid-operation (race conditions, state updates on unmounted components)
- Auth token or session state accessed during app startup before the auth provider has initialized
- Animations or transitions that assume the component stays mounted for their full duration
- Event handlers that reference stale closures (captured old state values)
- Rapid user interactions (double-tap, fast back-forward navigation) that the code doesn't debounce or guard against

**The question to ask:** "If the timing is wrong — the data isn't ready, the component unmounts early, the user acts faster than expected — does this code handle it or crash?"

---

## Output format

Structure your review like this:

1. **Brief standard review** — any obvious code quality issues (keep it short)
2. **Assumption findings** — for each issue found, report:
   - Which category it falls under
   - The specific code (with line reference if available)
   - What assumption it makes
   - A concrete scenario where that assumption breaks
   - A suggested fix or pattern
3. **What looks solid** — briefly note which assumption categories you checked and found no issues (this confirms you actually checked rather than just skipping them)

Prioritize findings by impact: a crash is worse than a visual glitch, a stuck user is worse than a cosmetic issue. If you find nothing, say so — don't manufacture issues to look thorough.

---

## What NOT to do

- Don't turn this into a style review. Code formatting, naming conventions, and architectural preferences are a different conversation.
- Don't list theoretical risks without concrete scenarios. "This could be null" is vague. "If the user opens this screen via deep link, `params.userId` is undefined, which crashes the `.find()` on line 42" is actionable.
- Don't suggest wrapping everything in defensive checks. The goal is to find the assumptions that *actually* break in realistic scenarios, not to add null checks on every line. 
- Don't just audit the file in isolation. If the file imports from other modules, or is used as a child component, consider how it fits into its actual runtime context. Ask to see parent components or navigation config if needed.
