-- CreateTable
CREATE TABLE "health_checks" (
    "id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- Enable Row Level Security (defense-in-depth on API path)
-- PostgREST: service_role can bypass RLS if used
-- Prisma: bypass via SQL database role (superuser in Phase 1)
-- Architecture: docs/architecture-decisions.md - Stage 4.2, Decision 4
-- Research: specs/001-walking-skeleton/research-validation.md - Agent 1 findings
ALTER TABLE "health_checks" ENABLE ROW LEVEL SECURITY;
