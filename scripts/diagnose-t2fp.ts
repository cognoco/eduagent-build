// Throwaway diagnostic for the staging baseline. Probes:
// (1) Distribution of session_events.event_type values for cohort sessions
// (2) Sample 5 cohort rows with raw timestamps so we can eyeball the gap
// (3) Whether language_code IS NOT NULL ever appears in subjects

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // (3) Language subjects exist at all?
    const langCount = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE language_code IS NOT NULL) AS language_subjects,
        COUNT(*) FILTER (WHERE language_code IS NULL) AS non_language_subjects,
        COUNT(*) AS total
      FROM subjects
    `);
    console.log('LANGUAGE FILTER:', langCount.rows);

    // (1) event_type distribution in session_events
    const eventTypes = await db.execute(sql`
      SELECT event_type, COUNT(*) AS n
      FROM session_events
      GROUP BY event_type
      ORDER BY n DESC
      LIMIT 20
    `);
    console.log('EVENT TYPE DISTRIBUTION:', eventTypes.rows);

    // (2) Five sample cohort rows with raw timestamps + computed diff
    const sample = await db.execute(sql`
      WITH all_time_first_subject AS (
        SELECT DISTINCT ON (profile_id)
          id AS subject_id,
          profile_id,
          language_code,
          created_at AS subject_created_at
        FROM subjects
        ORDER BY profile_id, created_at ASC
      ),
      cohort AS (
        SELECT * FROM all_time_first_subject
        WHERE subject_created_at >= '2026-04-01'::timestamptz
          AND subject_created_at < '2026-05-06'::timestamptz
      ),
      first_session AS (
        SELECT DISTINCT ON (subject_id)
          id AS session_id, subject_id, started_at, session_type
        FROM learning_sessions
        WHERE subject_id IN (SELECT subject_id FROM cohort)
        ORDER BY subject_id, started_at ASC
      ),
      first_ai AS (
        SELECT DISTINCT ON (session_id)
          session_id, created_at AS first_ai_at
        FROM session_events
        WHERE session_id IN (SELECT session_id FROM first_session)
          AND event_type = 'ai_response'
        ORDER BY session_id, created_at ASC, id ASC
      )
      SELECT
        c.subject_id,
        c.subject_created_at,
        fs.started_at AS first_session_started_at,
        fs.session_type,
        fa.first_ai_at,
        EXTRACT(EPOCH FROM (fa.first_ai_at - c.subject_created_at)) AS gap_seconds
      FROM cohort c
      LEFT JOIN first_session fs ON fs.subject_id = c.subject_id
      LEFT JOIN first_ai fa ON fa.session_id = fs.session_id
      WHERE fa.first_ai_at IS NOT NULL
      ORDER BY c.subject_created_at DESC
      LIMIT 8
    `);
    console.log('SAMPLE 8 COHORT ROWS WITH AI:');
    for (const r of sample.rows) {
      console.log(JSON.stringify(r));
    }

    // (4) Distribution of session_type for first_sessions in the cohort
    const sessionTypes = await db.execute(sql`
      WITH all_time_first_subject AS (
        SELECT DISTINCT ON (profile_id)
          id AS subject_id, profile_id, created_at AS sca
        FROM subjects
        ORDER BY profile_id, created_at ASC
      ),
      cohort AS (
        SELECT * FROM all_time_first_subject
        WHERE sca >= '2026-04-01'::timestamptz AND sca < '2026-05-06'::timestamptz
      ),
      first_session AS (
        SELECT DISTINCT ON (subject_id)
          id AS session_id, subject_id, session_type
        FROM learning_sessions
        WHERE subject_id IN (SELECT subject_id FROM cohort)
        ORDER BY subject_id, started_at ASC
      )
      SELECT session_type, COUNT(*) AS n
      FROM first_session
      GROUP BY session_type
      ORDER BY n DESC
    `);
    console.log('FIRST-SESSION TYPE DISTRIBUTION:', sessionTypes.rows);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
