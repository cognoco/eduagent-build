ALTER TABLE "profiles" ADD COLUMN "birth_month" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birth_day" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_range_check" CHECK ("profiles"."birth_month" IS NULL OR ("profiles"."birth_month" BETWEEN 1 AND 12));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_day_range_check" CHECK ("profiles"."birth_day" IS NULL OR ("profiles"."birth_day" BETWEEN 1 AND 31));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_birth_month_day_pairwise_check" CHECK (("profiles"."birth_month" IS NULL) = ("profiles"."birth_day" IS NULL));