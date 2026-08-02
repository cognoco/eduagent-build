-- WI-2895: repair the persisted credential correlate only for a complete,
-- internally consistent Person/Login circular binding. Managed Persons and
-- incomplete bindings remain false for explicit follow-up rather than being
-- guessed into an account-owning state. The predicate makes this idempotent.
UPDATE "person" AS p
SET
	"has_own_account" = true,
	"updated_at" = now()
FROM "login" AS l
WHERE
	l."person_id" = p."id"
	AND p."login_id" = l."id"
	AND p."has_own_account" = false;
