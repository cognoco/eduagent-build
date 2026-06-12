Completion summary (WI-628 — WP-L12-decorative-lowvision):

What was done:

F-056: 7 decorative animation components hidden from screen readers cross-platform — replaced the old accessibilityLabel + accessibilityRole="image" pattern with accessible={false} + importantForAccessibility="no-hide-descendants" (Android) + accessibilityElementsHidden (iOS) on every root: CelebrationAnimation, CheckmarkPopAnimation, DeskLampAnimation, LightBulbAnimation, MagicPenAnimation (both render paths), BookPageFlipAnimation, BrandCelebration. F-059: 5 decorative leading/trailing icons inside already-labeled containers hidden with the same three-prop pattern (importantForAccessibility="no" variant): OfflineBanner, NudgeBanner, EngagementChip, EarlyAdopterCard chevron, ProxyBanner eye-outline. F-060: 3 sub-floor fontSize:10 sites raised to the 12px caption floor (LivingBook page counter, SessionErrorBoundary DEV stack, TopicStatusRow relevance label) and a forward-only guard added (apps/mobile/src/lib/a11y-text-floor.guard.test.ts) rejecting any new fontSize at or below 10 in mobile source.

What changed:

The 13 hidden decorative nodes across 12 component files (7 animation components incl. MagicPenAnimation's two return paths, plus 5 banner/chip icon sites). The new a11y-text-floor guard test with a hardened regex (terminal class [^0-9.] excluding decimal continuations, alternation (10|[1-9]), positive/negative regex unit cases). The RNTL v13 includeHiddenElements:true query pattern applied across 8 test files (the 7 animation suites + create-subject.test.tsx), since RNTL v13 excludes accessible={false} nodes from default testID queries.

Verification:

3 CI rounds green on exact heads (e2fb5779c, 77774e61b, afd63ca10); Claude Code Review APPROVED on all rounds (0 blocking). Codex P2 (importantForAccessibility is Android-only; iOS needs accessibilityElementsHidden) fixed in 77774e61b with an in-thread cite (discussion_r3399177679), then regression-guarded in round 3: all 7 animation test suites assert the full 3-prop pattern (accessible=false + accessibilityElementsHidden + importantForAccessibility), incl. a new dedicated SR-hiding test in BrandCelebration.test.tsx. Guard regex hardened with explicit positive (9, 10, {10}) and negative (10.5, 11, 12) cases. Local: 68 related suites / 1386 tests green, tsc --noEmit clean, i18n checkers clean. Merged to main as 78992f5293599cc9a478f0dd254c7c8193973090 (PR #1014).

Caveats / Follow-ups: decorative-hiding forward guard documented infeasible per amendment 16 (what counts as decorative is context-dependent judgment, not mechanically expressible — reasoning in the PR #1014 body); AnimatedSplash deliberately excluded from F-056 (only content on screen during load, carries a meaningful skip Pressable); pre-existing fontSize:11 sites are out of WI-628 scope — the guard floor sits at 10, a stricter sweep to the full 12px caption floor is a separate future task.
