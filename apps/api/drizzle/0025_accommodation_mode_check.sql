ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_accommodation_mode_check" CHECK ("accommodation_mode" IN ('none', 'short-burst', 'audio-first', 'predictable'));
