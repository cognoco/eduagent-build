-- CreateTable
CREATE TABLE "health_checks" (
    "id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- Disable Row Level Security (API server is security boundary)
-- Architecture: docs/architecture-decisions.md - Stage 4.2, Decision 4
-- Research: docs/research/stage-4.4a-research-findings.md - Track 2
ALTER TABLE "health_checks" DISABLE ROW LEVEL SECURITY;
