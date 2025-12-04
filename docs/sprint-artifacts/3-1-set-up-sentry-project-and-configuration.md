# Story 3.1: Set Up Sentry Project and Configuration

Status: drafted

## Story

As an operations team member,
I want Sentry configured for the project,
so that we have centralized error tracking infrastructure.

## Acceptance Criteria

1. **AC1**: Given I have Sentry account access, when I create a project for this monorepo, then I have DSN credentials for server, web, and mobile
2. **AC2**: Credentials are added to `.env.example` template with appropriate placeholder values
3. **AC3**: GitHub Actions secrets are configured for CI/CD environments (documented, not implemented)
4. **AC4**: Setup process is documented in `docs/environment-setup.md`

## Tasks / Subtasks

- [ ] Task 1: Create Sentry Project (AC: #1)
  - [ ] 1.1: Log into Sentry (or create account if needed)
  - [ ] 1.2: Create new project named `nx-monorepo` (or appropriate name)
  - [ ] 1.3: Select JavaScript platform for initial setup
  - [ ] 1.4: Generate DSN for server application (Node.js)
  - [ ] 1.5: Generate DSN for web application (Next.js)
  - [ ] 1.6: Generate DSN for future mobile application (React Native)
  - [ ] 1.7: Record all DSNs securely

- [ ] Task 2: Update Environment Templates (AC: #2)
  - [ ] 2.1: Add `SENTRY_DSN_SERVER` placeholder to `.env.example`
  - [ ] 2.2: Add `SENTRY_DSN_WEB` placeholder to `.env.example`
  - [ ] 2.3: Add `SENTRY_DSN_MOBILE` placeholder to `.env.example`
  - [ ] 2.4: Add `SENTRY_ORG` and `SENTRY_PROJECT` placeholders for source map uploads
  - [ ] 2.5: Add `SENTRY_AUTH_TOKEN` placeholder for CI/CD

- [ ] Task 3: Document GitHub Actions Secrets (AC: #3)
  - [ ] 3.1: Document required secrets in `.github/README.md` or similar
  - [ ] 3.2: List secrets: `SENTRY_DSN_SERVER`, `SENTRY_DSN_WEB`, `SENTRY_AUTH_TOKEN`
  - [ ] 3.3: Note that actual secret values must be added manually in GitHub Settings

- [ ] Task 4: Create Setup Documentation (AC: #4)
  - [ ] 4.1: Create or update `docs/environment-setup.md`
  - [ ] 4.2: Document Sentry project creation steps
  - [ ] 4.3: Document environment variable configuration
  - [ ] 4.4: Document GitHub Actions secrets setup
  - [ ] 4.5: Include troubleshooting section for common Sentry setup issues

## Dev Notes

### Architecture Context

- **Observability Platform**: Sentry selected per architecture.md Section "Decision Summary"
- **Integration Points**: Server (Express), Web (Next.js), future Mobile (React Native)
- **Credentials Strategy**: Environment-based configuration, secrets in CI/CD

### Project Structure Notes

- Environment templates: `.env.example` at project root
- Documentation: `docs/environment-setup.md`
- GitHub Actions config: `.github/workflows/`

### Testing Considerations

This story is primarily configuration/documentation. Testing will be validated in Story 3.4.

### Blocking Decision Required

⚠️ **User input needed**: This story requires Sentry account access. Options:
1. Use existing Sentry organization
2. Create new Sentry account/project
3. Defer to alternative observability platform (requires architecture change)

### References

- [Source: docs/epics.md#Story-3.1-Set-Up-Sentry-Project-and-Configuration]
- [Source: docs/architecture.md#Integration-Architecture]
- [Source: docs/PRD.md#FR17]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

claude-opus-4-5-20251101

### Debug Log References

### Completion Notes List

### File List

