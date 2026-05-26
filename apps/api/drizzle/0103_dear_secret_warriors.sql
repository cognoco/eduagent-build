CREATE TABLE "child_cap_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_cap_notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'child_cap_notifications'
    AND policyname = 'child_cap_notifications_owner_profile_isolation'
 ) THEN
  CREATE POLICY "child_cap_notifications_owner_profile_isolation" ON "child_cap_notifications"
    USING ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)
    WITH CHECK ("owner_profile_id" = NULLIF(current_setting('app.current_profile_id', true), '')::uuid);
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "child_cap_notifications" ADD CONSTRAINT "child_cap_notifications_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_cap_notifications" ADD CONSTRAINT "child_cap_notifications_child_profile_id_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_cap_notifications_dedup_idx" ON "child_cap_notifications" USING btree ("owner_profile_id","child_profile_id","kind","occurred_on");--> statement-breakpoint
CREATE INDEX "child_cap_notifications_owner_active_idx" ON "child_cap_notifications" USING btree ("owner_profile_id","dismissed_at");
