-- @reference-only
-- ============================================================================
-- REFERENCE ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
-- This is stage T1 of the old 6-stage identity migration (empty
-- organizations + memberships tables, no readers). It is being REVERTED by the
-- identity-foundation reconstruction: data-model.md lists both tables under
-- "Replaces (T1, inert)", and the baseline reset (MMT-ADR-0012) rebuilds the
-- schema create-from-empty. Do not apply or build on this.
-- Status: committed for history reference, superseded; applied nowhere live.
-- See docs/canon/identity/data-model.md §2 and docs/adr/MMT-ADR-0012.
-- ============================================================================
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'mentor', 'student');--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"roles" "membership_role"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_person_org_unique" UNIQUE("person_id","organization_id"),
	CONSTRAINT "memberships_roles_non_empty" CHECK (cardinality("memberships"."roles") >= 1)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"deletion_cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_organization_id_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_clerk_user_id_unique" UNIQUE("clerk_user_id");--> statement-breakpoint
-- ============================================================================
-- Identity T1 backfill (hand-appended; NOT drizzle-generated).
-- This block is the single-source identity-t1-backfill.sql embedded VERBATIM.
-- Do NOT regenerate this migration — `db:generate:dev` would drop this DML
-- (drizzle only reproduces the schema diff). Any further schema change is a new
-- migration. See the T1 plan §"Migration-regeneration guard".
-- ============================================================================
DO $$
BEGIN
  -- [HIGH-3] The backfill assumes exactly one is_owner profile per account
  -- (the org-name lookup would otherwise be multi-row, and the clerk_user_id
  -- copy would duplicate-key on profiles.clerk_user_id). Fail loudly if not.
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE is_owner = true
    GROUP BY account_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'identity-t1 backfill: account(s) with >1 is_owner profile';
  END IF;

  -- 1. One organization per account; id REUSED from account.id. Name from the
  --    owner profile (archived INCLUDED — an account mid-deletion can have an
  --    archived owner, and organizations.name is NOT NULL), falling back to the
  --    email local-part, then a literal so the INSERT can never fail on NULL.
  INSERT INTO organizations (
    id, name, timezone,
    deletion_scheduled_at, deletion_cancelled_at, created_at, updated_at
  )
  SELECT
    a.id,
    -- NULLIF(trim(...), '') so a blank/whitespace display_name or an email with
    -- no local-part falls through to the literal — COALESCE alone only skips
    -- NULL, and organizations.name (NOT NULL) would otherwise persist as ''.
    COALESCE(
      NULLIF(trim((SELECT p.display_name FROM profiles p
        WHERE p.account_id = a.id AND p.is_owner = true
        ORDER BY p.created_at ASC
        LIMIT 1)), ''),
      NULLIF(split_part(a.email, '@', 1), ''),
      'My Organization'
    ),
    a.timezone,
    a.deletion_scheduled_at,
    a.deletion_cancelled_at,
    now(),
    now()
  FROM accounts a
  ON CONFLICT (id) DO NOTHING;

  -- 2. One membership per profile (archived INCLUDED — a seat-removed child is
  --    archivedAt-marked with data preserved; excluding it would orphan that
  --    person from the only scoping model once T7 drops account_id). Roles:
  --    owner if is_owner; mentor if the person appears as a parent in
  --    family_links; student always. array_remove drops the absent-role NULLs;
  --    'student' guarantees a non-empty set.
  INSERT INTO memberships (
    id, person_id, organization_id, roles, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    p.id,
    p.account_id,  -- == organizations.id (id reuse)
    array_remove(ARRAY[
      CASE WHEN p.is_owner = true THEN 'owner'::membership_role END,
      CASE WHEN EXISTS (
        SELECT 1 FROM family_links fl WHERE fl.parent_profile_id = p.id
      ) THEN 'mentor'::membership_role END,
      'student'::membership_role
    ], NULL),
    now(),
    now()
  FROM profiles p
  ON CONFLICT (person_id, organization_id) DO NOTHING;

  -- 3. Copy the Clerk credential down to the OWNER profile only (the only
  --    profile with a login today). Idempotent via IS DISTINCT FROM.
  UPDATE profiles p
  SET clerk_user_id = a.clerk_user_id,
      updated_at = now()
  FROM accounts a
  WHERE p.account_id = a.id
    AND p.is_owner = true
    AND p.clerk_user_id IS DISTINCT FROM a.clerk_user_id;

  -- 4. Point each subscription at its account's organization (== account_id).
  UPDATE subscriptions s
  SET organization_id = s.account_id,
      updated_at = now()
  WHERE s.organization_id IS DISTINCT FROM s.account_id;
END $$;