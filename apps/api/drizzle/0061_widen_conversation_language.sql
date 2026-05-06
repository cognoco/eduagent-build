ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_conversation_language_check";
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_conversation_language_check" CHECK ("conversation_language" IN ('en','cs','es','fr','de','it','pt','pl','ja','nb')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_conversation_language_check";
