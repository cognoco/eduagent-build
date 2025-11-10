# Troubleshooting Reference – Core Summary

## TL;DR
- Use this guide to diagnose recurring build/test/runtime issues; load only the module matching the symptom.
- Focus areas include Jest hangs, Nx cache drift, TypeScript resolution problems, build/test failures, and Prisma-specific incidents.
- Each module contains reproduction hints, remediation steps, and warning signs to watch for.

## Critical Rules
- Confirm whether the issue is covered here before starting fresh investigations; reuse known fixes.
- Document new incidents via the manifest if they’re not already captured.
- When applying fixes, update run logs with the module ID for traceability.
- New troubleshooting guidance must cite the governing `docs/` artefact (document + section) and briefly justify the alignment.

## Module Index
- [Overview](module-01-overview.md)
- [Table of Contents](module-02-table-of-contents.md)
- [Jest Hanging on Windows](module-03-jest-hanging-on-windows.md)
- [Nx Cache Issues](module-04-nx-cache-issues.md)
- [TypeScript Path Resolution](module-05-typescript-path-resolution.md)
- [Build Failures](module-06-build-failures.md)
- [Test Failures](module-07-test-failures.md)
- [Prisma Issues](module-08-prisma-issues.md)
- [Related Documentation](module-09-related-documentation.md)

## Usage Notes
- Capture environment details when logging new incidents to improve future triage.
- Cross-reference tech-findings log entries when escalations produce broader learnings.

