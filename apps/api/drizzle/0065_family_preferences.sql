CREATE TABLE "family_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"pool_breakdown_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_preferences_owner_profile_id_unique" UNIQUE("owner_profile_id")
);
--> statement-breakpoint
ALTER TABLE "family_preferences" ADD CONSTRAINT "family_preferences_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_preferences_owner_profile_id_idx" ON "family_preferences" USING btree ("owner_profile_id");
