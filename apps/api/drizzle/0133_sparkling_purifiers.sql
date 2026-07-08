WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "owner_profile_id", "type", "payload_json"
			ORDER BY "created_at" ASC, "id" ASC
		) AS rn,
		min("seen_at") FILTER (WHERE "seen_at" IS NOT NULL) OVER (
			PARTITION BY "owner_profile_id", "type", "payload_json"
		) AS merged_seen_at
	FROM "pending_notices"
)
UPDATE "pending_notices"
SET "seen_at" = ranked.merged_seen_at
FROM ranked
WHERE "pending_notices"."id" = ranked."id"
	AND ranked.rn = 1
	AND ranked.merged_seen_at IS NOT NULL
	AND "pending_notices"."seen_at" IS DISTINCT FROM ranked.merged_seen_at;--> statement-breakpoint
WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "owner_profile_id", "type", "payload_json"
			ORDER BY "created_at" ASC, "id" ASC
		) AS rn
	FROM "pending_notices"
)
DELETE FROM "pending_notices"
USING ranked
WHERE "pending_notices"."id" = ranked."id"
	AND ranked.rn > 1;--> statement-breakpoint
WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "supportership_id", "notice_type", "target_audience", "target_person_id", "payload"
			ORDER BY "created_at" ASC, "id" ASC
		) AS rn,
		min("acknowledged_at") FILTER (WHERE "acknowledged_at" IS NOT NULL) OVER (
			PARTITION BY "supportership_id", "notice_type", "target_audience", "target_person_id", "payload"
		) AS merged_acknowledged_at
	FROM "support_visibility_notices"
)
UPDATE "support_visibility_notices"
SET "acknowledged_at" = ranked.merged_acknowledged_at
FROM ranked
WHERE "support_visibility_notices"."id" = ranked."id"
	AND ranked.rn = 1
	AND ranked.merged_acknowledged_at IS NOT NULL
	AND "support_visibility_notices"."acknowledged_at" IS DISTINCT FROM ranked.merged_acknowledged_at;--> statement-breakpoint
WITH ranked AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "supportership_id", "notice_type", "target_audience", "target_person_id", "payload"
			ORDER BY "created_at" ASC, "id" ASC
		) AS rn
	FROM "support_visibility_notices"
)
DELETE FROM "support_visibility_notices"
USING ranked
WHERE "support_visibility_notices"."id" = ranked."id"
	AND ranked.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_notices_owner_type_payload_uq" ON "pending_notices" USING btree ("owner_profile_id","type","payload_json");--> statement-breakpoint
CREATE UNIQUE INDEX "support_visibility_notices_supportership_type_target_payload_uq" ON "support_visibility_notices" USING btree ("supportership_id","notice_type","target_audience","target_person_id","payload");
