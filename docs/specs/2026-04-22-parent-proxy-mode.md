# Parent Proxy Mode

**Status:** Draft  
**Date:** 2026-04-22  
**Scope:** Mobile app + API creation guards

## Summary

A parent (owner profile) can switch into a child's account to browse their library, progress, recaps, bookmarks, and notes — without being able to start sessions or delete the child's saved content. The child's chat history is never exposed.

---

## 1. State & Detection

### useParentProxy() hook

**File:** `apps/mobile/src/hooks/use-parent-proxy.ts` (new)

Derives state purely from ProfileContext. No new API calls.

```typescript
export function useParentProxy(): {
  isParentProxy: boolean;
  childProfile: Profile | null;
  parentProfile: Profile | null;
}
```

- `isParentProxy = !activeProfile?.isOwner && profiles.some(p => p.isOwner)`
- `childProfile = activeProfile` (when proxy is active)
- `parentProfile = profiles.find(p => p.isOwner) ?? null`

### Reactive proxy flag sync

The hook includes a `useEffect` that keeps the API client's module-level `_proxyMode` flag and the SecureStore key `parent-proxy-active` in sync with the derived `isParentProxy` state. This covers **all** transitions — including profile deletion, server-side profile changes, and manual switch-back:

```typescript
useEffect(() => {
  setProxyMode(isParentProxy);
  if (isParentProxy) {
    void SecureStore.setItemAsync('parent-proxy-active', 'true');
  } else {
    void SecureStore.deleteItemAsync('parent-proxy-active');
  }
}, [isParentProxy]);
```

This replaces the original design of managing SecureStore and `setProxyMode` in multiple call sites (profiles.tsx, \_layout.tsx banner, profile.ts removal handler). The hook is the single source of truth — callers just call `switchProfile()` and the rest follows reactively.

### API client integration

**File:** `apps/mobile/src/lib/api-client.ts` (modify)

Module-level flag alongside the existing `_activeProfileId` pattern:

```typescript
let _proxyMode = false;

export function setProxyMode(enabled: boolean): void {
  _proxyMode = enabled;
}
```

In `customFetch`, after the `X-Profile-Id` header line:

```typescript
if (_proxyMode) headers.set('X-Proxy-Mode', 'true');
```

### App-restart persistence

**File:** `apps/mobile/src/lib/profile.ts` (modify)

On ProfileProvider mount, read SecureStore and seed the API client flag so the first API request after app restart already carries the header:

```typescript
useEffect(() => {
  void SecureStore.getItemAsync('parent-proxy-active').then((val) => {
    setProxyMode(val === 'true');
  });
}, []);
```

The `useParentProxy` hook's reactive sync (Section 1) immediately corrects any stale state once the profile list loads — so even if SecureStore says `true` but the child profile no longer exists, the flag is cleared within the first render cycle.

### Race window on app restart

Between SecureStore read (ProfileProvider mount) and the first render of `useParentProxy` (profile list loaded), the API client may carry a stale `_proxyMode = true` flag. Any API call in this window (e.g., profile list fetch, prefetch queries) sends `X-Proxy-Mode: true` on requests that might not be in proxy context.

**Why this is acceptable:** The server-side guard (Section 5) only blocks *creation* endpoints. Read-only GET requests are unaffected by the header. The profile list fetch itself is a GET. By the time the user can navigate to a creation flow, `useParentProxy` has already corrected the flag. The window is typically <200ms (single render cycle).

---

## 2. Entry: Confirmation Bottom Sheet

**File:** `apps/mobile/src/app/profiles.tsx` (modify)

Currently: tapping a non-owner profile calls `switchProfile(id)` immediately.

New flow when the active profile is an owner and the tapped profile is a non-owner (child):

1. Show a confirmation modal before committing the switch:

```
┌─────────────────────────────────┐
│  Viewing [Child Name]'s account │
│                                 │
│  You'll see their library,      │
│  progress, recaps and saved     │
│  bookmarks. Chats are private   │
│  to [Child Name].               │
│                                 │
│  [View account]   [Cancel]      │
└─────────────────────────────────┘
```

2. **"View account":** call `switchProfile(childId)`. The reactive sync in `useParentProxy` handles the rest (sets `_proxyMode`, writes SecureStore).
3. **"Cancel":** dismiss, stay on parent profile.

### Switch-back

When the parent taps their own profile while in proxy mode — no confirmation needed, immediate `switchProfile(parentId)`. The reactive sync clears the proxy flag automatically.

### Child-to-child switching

When a parent has multiple children and switches directly from Child A to Child B while already in proxy mode — no confirmation. The parent already acknowledged the privacy notice. The banner updates to the new child's name via the derived `childProfile` state.

Routing through `handleProfileTap`:

| `activeProfile.isOwner` | `tappedProfile.isOwner` | Action |
|---|---|---|
| true | false | Show confirmation sheet |
| false | true | Immediate switch (proxy clears reactively) |
| false | false | Immediate switch (stays in proxy mode) |
| true | true | N/A (single owner per account) |

---

## 3. Persistent Proxy Banner

**File:** `apps/mobile/src/app/(app)/_layout.tsx` (modify)

When `isParentProxy === true`, render a thin non-dismissable banner above the `<Tabs>` inside the existing flex container:

```
┌─────────────────────────────────────────────────────┐
│  👁  Viewing [Child Name]'s account   [Switch back] │
└─────────────────────────────────────────────────────┘
```

- Always visible so the parent knows they're in proxy mode.
- "Switch back" calls `switchProfile(parentProfile.id)`. The reactive sync handles the rest.
- Uses `surface-elevated` background + `text-secondary` color for visual distinction.
- Only rendered when `isParentProxy` — zero impact on normal sessions.
- Fixed height: 44px. Rendered **inside** the existing `SafeAreaView` (below the safe-area inset, above the tab bar) so it does not compete with the bottom home indicator on notched devices.

The `FULL_SCREEN_ROUTES` set (session, homework, dictation, quiz) already hides the tab bar — and those routes are gated (Section 4), so the banner is never visible inside them.

---

## 4. Screen Gating

### Blocked routes

Redirect to `/(app)/home` when `isParentProxy`:

| Layout / Page file | Gating point |
|---|---|
| `apps/mobile/src/app/(app)/session/_layout.tsx` | `isParentProxy` redirect at top of layout |
| `apps/mobile/src/app/(app)/homework/_layout.tsx` | Same pattern |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | Same pattern |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | Same pattern |
| `apps/mobile/src/app/(app)/practice.tsx` | Redirect at component top |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | Redirect at component top |
| `apps/mobile/src/app/(app)/topic/relearn.tsx` | Redirect at component top |

Redirect pattern (same as existing consent gate redirects):

```typescript
const { isParentProxy } = useParentProxy();
if (isParentProxy) return <Redirect href="/(app)/home" />;
```

> **Correction from brainstorming:** `/(app)/topic/relearn` was originally listed as "safe." It is not — `relearn.tsx` calls `POST /retention/relearn` (creates a server-side session with a `sessionId`) then navigates to `/(app)/session`. It must be gated.

### Allowed routes

No changes needed — these already show the child's data once the profile is switched:

| Route | What parent sees | Notes |
|---|---|---|
| `library.tsx` | Subjects + topics | Subject status actions (pause/archive/restore) are allowed — parent can manage curriculum |
| `subject/[subjectId].tsx` | Subject detail + analogy picker | Analogy domain preference is allowed |
| `topic/[topicId].tsx` | Topic detail | Session CTAs are present but navigate to gated routes → redirect fires |
| `shelf/` | Books + chapters | Read-only |
| `progress/` | Stats, milestones, vocabulary | Read-only (verified: no mutation affordances on vocabulary or milestones screens) |
| `progress/[subjectId].tsx` | Subject progress detail | "Keep learning" CTA navigates to gated `/session` → redirect fires (same pattern as topic detail) |
| `progress/saved.tsx` | Bookmarks | **Delete affordance suppressed** (see Section 6) |
| `more.tsx` | Settings | Writes allowed — notification, learning mode, accommodation are legitimate parent adjustments (see Section 10: design decision) |
| Session summary screens | Recaps, closing lines | Read-only |
| `create-subject` | Subject creation | **Intentionally allowed** — parents setting up subjects for children is a helpful action |

### Home tab CTAs

`LearnerScreen.tsx` shows intent cards with session-navigating CTAs. In proxy mode, **all cards navigating to blocked routes are filtered out** and replaced with a single muted placeholder:

```
┌─────────────────────────────────────────────┐
│  🔒  Sessions are private to [Child Name]   │
└─────────────────────────────────────────────┘
```

Blocked intent cards (filtered when `isParentProxy`):
- `intent-continue` — **all three variants** (recovery → session, suggestion → session, review → relearn) navigate to session-creating routes
- `intent-quiz-discovery` → quiz
- `intent-ask` → session (freeform)
- `intent-practice` → practice
- `intent-homework` → homework

Kept:
- `intent-learn` → `/create-subject` (safe, intentionally allowed)

After filtering, the home screen always renders at least **2 items**: the `intent-learn` card (unconditionally pushed) and the proxy placeholder. The `intent-learn` card is one of 4 static cards pushed regardless of data state — the other 3 (ask, practice, homework) are filtered. There is no zero-card empty state to handle.

---

## 5. API: Server-Side Creation Guards

The mobile API client attaches `X-Proxy-Mode: true` on all requests when the proxy flag is set.

### Shared guard helper

**File:** `apps/api/src/middleware/proxy-guard.ts` (new)

```typescript
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

export function assertNotProxyMode(c: Context): void {
  if (c.req.header('X-Proxy-Mode') === 'true') {
    throw new HTTPException(403, { message: 'Not available in proxy mode' });
  }
}
```

### Guarded creation endpoints

Call `assertNotProxyMode(c)` at the top of each handler:

| File | Endpoint | Line |
|---|---|---|
| `routes/interview.ts` | `POST /subjects/:subjectId/interview` | ~38 |
| `routes/interview.ts` | `POST /subjects/:subjectId/interview/stream` | ~119 |
| `routes/interview.ts` | `POST /subjects/:subjectId/interview/complete` | ~245 |
| `routes/sessions.ts` | `POST /subjects/:subjectId/sessions` | ~80 |
| `routes/sessions.ts` | `POST /sessions/interleaved` | ~529 |
| `routes/homework.ts` | `POST /subjects/:subjectId/homework` | ~27 |
| `routes/quiz.ts` | `POST /quiz/rounds` | ~231 |
| `routes/quiz.ts` | `POST /quiz/rounds/prefetch` | ~249 |
| `routes/dictation.ts` | `POST /dictation/generate` | ~109 |
| `routes/dictation.ts` | `POST /dictation/result` | ~128 |
| `routes/retention.ts` | `POST /retention/relearn` | ~87 |
| `routes/retention.ts` | `POST /retention/recall-test` | ~73 |
| `routes/assessments.ts` | `POST /subjects/:subjectId/topics/:topicId/assessments` | ~32 |

**Not guarded** (stateless utilities, no learning record created):
- `POST /dictation/prepare-homework` — text-splitting utility
- `POST /dictation/review` — AI review of handwritten photo, no session state

### Why guard all creation endpoints

The original spec guarded only `POST /interview`, reasoning that other routes had "no direct bypass path." This was incorrect:

1. **The `mentomate://` URL scheme is registered** (`app.json`). Expo Router auto-routes any `mentomate://(app)/quiz/...` URL, bypassing the home screen entirely. A crafted URL (bookmark, QR code, link from another app) reaches any route directly.
2. **Push notifications don't currently deep-link** (no tap handler exists), but when notification deep-linking is added in the future, all gated routes become reachable.
3. **The cost is trivial** — one shared helper, one line per handler. The cost of not guarding is a silent session creation under a child's profile if any client-side gate is bypassed.

### What these guards provide and do not provide

This is **defense-in-depth against client bugs and URL-scheme bypass**, not a security boundary. The header is client-sent — a determined user can strip it and call the endpoint directly with the child's `profileId`. The primary protection is UI gating (Section 4). The server guards catch cases where a navigation error or crafted deep-link bypasses the redirect guard.

---

## 6. What Parents See in Allowed Screens

### Session recap

Existing `closingLine` and `learnerRecap` fields on `session_summaries` are visible. The raw exchange list (chat messages) is never fetched by the parent view.

### Bookmarks

**File:** `apps/mobile/src/app/(app)/progress/saved.tsx` (modify)

The snapshotted `content` column on bookmarks is visible. Bookmarks survive session deletion by design (content is denormalized). The parent sees the saved explanation but cannot navigate to the originating session chat.

**Delete affordance is suppressed in proxy mode.** The trash icon button (line ~57-69 in `saved.tsx`) is hidden when `isParentProxy`. The parent can view but not delete the child's bookmarks.

```typescript
const { isParentProxy } = useParentProxy();

// In bookmark row JSX — hide trash icon:
{!isParentProxy && (
  <Pressable onPress={() => onDelete(bookmark)} ...>
    <Ionicons name="trash-outline" ... />
  </Pressable>
)}
```

### Topic notes

`InlineNoteCard` (used in the book screen) is already read-only — it displays note content with no edit or delete affordances. `NoteInput` only appears inside session routes, which are gated. No changes needed.

> `NoteDisplay.tsx` exists as a component with `readOnly` prop but has no callers in the current codebase. No action required.

### Encouragement

The `closingLine` field (per-session encouragement summary) is part of session recap — visible to parent.

### Mentor memory

Blocked via redirect guard on `mentor-memory.tsx`. The parent accesses mentor memory through the dedicated parent dashboard route (`/dashboard/children/:id/memory`) — not through the proxy view.

### Progress detail & vocabulary

`progress/[subjectId].tsx` has a "Keep learning" CTA that navigates to `/session` — the redirect guard fires (same accepted pattern as topic detail). The vocabulary and milestones sub-screens (`vocabulary.tsx`, `milestones.tsx`) are confirmed read-only with no mutation affordances. No changes needed.

### More tab settings

Allowed. Write operations on the More tab (notification toggles, learning mode, accommodation, tutor language) are legitimate parental controls. Dangerous operations (delete account, sign out) are account-level with their own confirmation flows and do not operate on the child profile specifically.

> **Product note:** Settings changes made by the parent are silent — the child is not notified that their preferences changed. This is an accepted trade-off: the parent is the account owner, and these settings (accommodations, notifications, tutor language) are explicitly parental-control territory. If child notification of preference changes is desired later, it belongs in a separate feature, not this spec.

---

## 7. Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Parent deep-links to /session while in proxy mode | Bookmarked URL, `mentomate://` link | Session layout redirects to home immediately | Banner explains proxy mode |
| Parent deep-links to /topic/relearn in proxy mode | `mentomate://` link | Relearn page redirects to home immediately | Banner explains proxy mode |
| Parent deep-links to any gated route via URL scheme | `mentomate://(app)/quiz/...` etc. | Layout/page redirect guard fires → home | Banner explains proxy mode |
| Any creation POST called with X-Proxy-Mode: true | URL-scheme bypass or API client bug | 403 "Not available in proxy mode" | Mobile shows toast |
| App reopened while proxy flag in SecureStore | Normal app lifecycle | Banner shown, proxy mode continues | "Switch back" in banner |
| Child's profile deleted while parent is in proxy mode | Server-side profile removal | `profileWasRemoved` guard fires → switches to owner. Reactive sync in `useParentProxy` clears `_proxyMode` and SecureStore automatically. | Existing toast: "Profile switched" |
| Parent's profile deleted while in proxy mode | Server-side profile removal | Same `profileWasRemoved` guard → switches to remaining profile. Reactive sync clears proxy flag. | Existing toast |
| SecureStore read fails on app start | Device storage issue | `parent-proxy-active` unreadable → API client sends no proxy header. Reactive sync sets correct state once profiles load. | Graceful degradation — UI gating is primary |
| Home screen CTA tapped in proxy mode | N/A — blocked CTAs are filtered out | Proxy placeholder: "Sessions are private to [Name]" | No navigation — handled in-place |
| SecureStore says proxy=true but child profile no longer exists | Profile deleted between app sessions | Reactive sync detects `isParentProxy=false` → clears flag within first render cycle | Self-healing, no user action needed |

---

## 8. Out of Scope

- Push notification deep-link handling — currently no notification tap handler exists; when one is added, all gated routes already have redirect guards and all creation endpoints have server guards
- Child notification of parent settings changes — accepted trade-off (see Section 6, More tab)
- New parent-dashboard API routes — this spec is mobile-only; existing dashboard spec handles parent-facing data
- Cross-account family links (separate accounts)
- Suppressing CTAs on `topic/[topicId].tsx` and `progress/[subjectId].tsx` — buttons navigate to gated routes and redirect fires; acceptable UX for deeper screens (unlike LearnerScreen which is the home surface)

---

## 9. Files Changed

| File | Change |
|---|---|
| `apps/mobile/src/hooks/use-parent-proxy.ts` | **New** — hook + reactive proxy flag sync |
| `apps/mobile/src/hooks/use-parent-proxy.test.ts` | **New** — unit tests |
| `apps/mobile/src/lib/api-client.ts` | Module-level `_proxyMode` flag + `setProxyMode()` + header injection |
| `apps/mobile/src/lib/profile.ts` | SecureStore init on ProfileProvider mount |
| `apps/mobile/src/app/profiles.tsx` | Confirmation sheet before child switch |
| `apps/mobile/src/app/(app)/_layout.tsx` | Persistent proxy banner above tab navigator |
| `apps/mobile/src/app/(app)/session/_layout.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/homework/_layout.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/dictation/_layout.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/quiz/_layout.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/practice.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/mentor-memory.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/topic/relearn.tsx` | Proxy redirect guard |
| `apps/mobile/src/app/(app)/progress/saved.tsx` | Suppress bookmark delete in proxy mode |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Filter blocked intent cards + proxy placeholder |
| `apps/api/src/middleware/proxy-guard.ts` | **New** — shared `assertNotProxyMode` helper |
| `apps/api/src/middleware/proxy-guard.test.ts` | **New** — unit test for the guard |
| `apps/api/src/routes/interview.ts` | `assertNotProxyMode` on POST interview, stream, complete |
| `apps/api/src/routes/sessions.ts` | `assertNotProxyMode` on POST sessions, interleaved |
| `apps/api/src/routes/homework.ts` | `assertNotProxyMode` on POST homework |
| `apps/api/src/routes/quiz.ts` | `assertNotProxyMode` on POST rounds, prefetch |
| `apps/api/src/routes/dictation.ts` | `assertNotProxyMode` on POST generate, result |
| `apps/api/src/routes/retention.ts` | `assertNotProxyMode` on POST relearn, recall-test |
| `apps/api/src/routes/assessments.ts` | `assertNotProxyMode` on POST assessments |

---

## 10. Design Decisions Log

| Decision | Rationale |
|---|---|
| Reactive sync in hook instead of manual flag management | Eliminates stale-flag bugs (profile deletion, server-side changes). Single source of truth. |
| `/create-subject` allowed in proxy mode | Parents setting up subjects for children is a helpful action, not a privacy violation. |
| More tab writes allowed, child not notified | Notification, learning mode, accommodation, language are legitimate parental controls. Parent is account owner. Silent changes accepted — child notification is a separate feature if desired later. |
| Bookmark delete suppressed | Child's saved content should not be deletable by proxy viewer. |
| `/(app)/topic/relearn` gated | Creates server-side sessions via `POST /retention/relearn`. Not read-only. |
| No confirmation for child-to-child switching | Parent already acknowledged privacy notice. Banner updates reactively. |
| X-Proxy-Mode header is defense-in-depth only | Client-sent header is strippable. UI gating is the primary protection. Server guard catches client bugs and URL-scheme bypass. |
| Guard ALL creation endpoints, not just interview | `mentomate://` URL scheme is registered — Expo Router auto-routes any crafted URL to any route. One shared helper + one line per handler is trivial cost. Future notification deep-links also covered. |
| Topic/progress detail CTAs left as-is (bounce to redirect) | Lower-traffic deeper screens. Adding proxy awareness to every CTA surface increases scope without proportional UX benefit. |
| Banner fixed at 44px inside SafeAreaView | Avoids competing with bottom home indicator on notched devices. Consistent with existing tab-bar layout constraints. |
| Race window on restart is acceptable | Only GET requests fire before reactive sync corrects. Creation endpoints require user navigation, which cannot happen in <200ms. |
