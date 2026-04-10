ALTER TYPE "public"."notification_type" ADD VALUE 'weekly_progress';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'monthly_report';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'progress_refresh';--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"milestone_type" text NOT NULL,
	"threshold" integer NOT NULL,
	"subject_id" uuid,
	"book_id" uuid,
	"metadata" jsonb,
	"celebrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"child_profile_id" uuid NOT NULL,
	"report_month" date NOT NULL,
	"report_data" jsonb NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "weekly_progress_push" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_book_id_curriculum_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."curriculum_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_child_profile_id_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_scope_uq" ON "milestones" USING btree ("profile_id","milestone_type","threshold",coalesce("subject_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("book_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "milestones_profile_created_idx" ON "milestones" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_parent_child_month_uq" ON "monthly_reports" USING btree ("profile_id","child_profile_id","report_month");--> statement-breakpoint
CREATE INDEX "monthly_reports_child_month_idx" ON "monthly_reports" USING btree ("child_profile_id","report_month");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_snapshots_profile_date_uq" ON "progress_snapshots" USING btree ("profile_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "progress_snapshots_profile_date_idx" ON "progress_snapshots" USING btree ("profile_id","snapshot_date");