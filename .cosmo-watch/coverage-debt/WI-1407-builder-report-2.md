Implemented and shipped `WI-1407 (Consent/profile gate coverage gaps)`.

PR: https://github.com/cognoco/eduagent-build/pull/1939  
Commit: `637d09dc7`  
Cosmo: moved to `Stage=Reviewing`; `Fixed In` is set to the commit URL; claim fields are cleared.

What changed:
- Added `ProfileBasicsStep` regression coverage for under-18 parent birth year in child-save flow: adult-required message, disabled Continue, no profile POST.
- Added self `MentorMemoryScreen` tests for grant/decline consent, injection toggle, and clear-all through self endpoints.
- Added manual Maestro flow `preview-parent-minor-owner-rejected.yaml`; evidence marked in the flow header as `verify-at-e2e-run`.

Verification:
- Focused Jest: `27` tests passed across the two touched suites.
- Mobile `tsc`, targeted ESLint, GC1, i18n JSX literal, no-clinical-copy, Maestro validator, and YAML parse passed.
- Red-green-revert done: removing `adultGatePasses` made the new save-wizard regression fail, then restoring it made the suites pass.
- GitHub checks green; Claude review approved with no findings; PR merge state `CLEAN`.

---
**[ BOTTOM LINE ]** `WI-1407` is complete from builder side: PR green, Cosmo transitioned to Reviewing.

**[ FYI ]**
- Maestro device flow was not run on emulator/dev-client; evidence remains `verify-at-e2e-run`.
- GC6 mock burn-down was deferred in the commit body for pre-existing internal mocks in the edited test files.