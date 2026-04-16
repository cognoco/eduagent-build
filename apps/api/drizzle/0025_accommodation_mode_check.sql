-- Ordering assumption: 0023_shiny_skrulls added accommodation_mode with
-- DEFAULT 'none' NOT NULL, so no invalid value can exist before this CHECK
-- lands. The app also validates via Zod at the service layer. If this
-- migration fails on a fresh environment, ensure 0023 was applied first.
ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_accommodation_mode_check" CHECK ("accommodation_mode" IN ('none', 'short-burst', 'audio-first', 'predictable'));
