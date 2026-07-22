CREATE UNIQUE INDEX "evidence_links_profile_endpoints_unique" ON "evidence_links" USING btree ("profile_id","from_kind","from_id","to_kind","to_id");
