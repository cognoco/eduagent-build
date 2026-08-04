## What was done

Delivered both live acceptance arms for WI-1628: the migration-journal preflight now detects partial drift before migrate, and protected database credentials are split so ordinary lane access cannot write to staging or production. The operator-authorized staging activation and exact journal repair were completed through guarded workflows.

## What changed

The deployment path now verifies journal state, pending DDL effects, database target, and the distinct Worker role before migration and secret sync. The staging repair deleted only the two reviewed orphan journal rows, applied the pending family-join migration through the normal deploy, verified the post-deploy journal, and removed the temporary repair workflow. Durable implementation and operational receipts are recorded in `docs/evidence/WI-1628/report.md`.

## Verification

Current receipts cover the complete database-script surface, including native PostgreSQL transaction, rollback, unchanged-drift, and definition-only-drift cases. The repaired staging deploy completed migration, Worker-role re-verification, protected secret sync, Cloudflare deployment, and API smoke checks. A separate read-only workflow then confirmed the two orphan rows absent, all committed migrations applied, and no migration pending.

## Caveats / Follow-ups

The unretained SQL bodies cannot be reconstructed, so the reviewed staging catalog drift remains explicitly accepted for this pre-MVP environment. Production was not changed. The temporary `staging_worker` role remains governed by the launch-gate work item and must be replaced or formally remediated before MVP launch.
