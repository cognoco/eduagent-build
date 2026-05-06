CREATE TABLE "usage_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "subscription_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delta" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "usage_events_delta_range" CHECK ("delta" IN (1, -1))
);

ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_subscription_id_subscriptions_id_fk"
  FOREIGN KEY ("subscription_id")
  REFERENCES "public"."subscriptions"("id")
  ON DELETE cascade
  ON UPDATE no action;

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_profile_id_profiles_id_fk"
  FOREIGN KEY ("profile_id")
  REFERENCES "public"."profiles"("id")
  ON DELETE cascade
  ON UPDATE no action;

CREATE INDEX "usage_events_subscription_occurred_idx"
  ON "usage_events" USING btree ("subscription_id", "occurred_at");

CREATE INDEX "usage_events_profile_occurred_idx"
  ON "usage_events" USING btree ("profile_id", "occurred_at");
