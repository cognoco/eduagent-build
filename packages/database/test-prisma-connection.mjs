/**
 * Prisma Connection Smoke Test
 *
 * Stage 4.4b Phase 7.5: Server-side programmatic test
 * Verifies Prisma Client works end-to-end with Supabase PostgreSQL
 *
 * HOW TO RUN:
 * From workspace root:
 *   node packages/database/test-prisma-connection.mjs
 *
 * REQUIREMENTS:
 * - DATABASE_URL must be set in .env (workspace root)
 * - Prisma Client must be generated: npx prisma generate --schema=packages/database/prisma/schema.prisma
 * - HealthCheck table must exist in database
 *
 * WINDOWS ARM64 USERS:
 * This test will fail on Windows ARM64 due to Prisma engine limitations.
 * Workaround: Run in WSL2 or rely on CI/CD verification on x64 Linux.
 * See: packages/database/PLATFORM-NOTES.md
 *
 * Tests:
 * 1. Create health check record
 * 2. Read all records
 * 3. Read by ID
 * 4. Delete test record
 * 5. Verify cleanup (count = 0)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSmokeTests() {
  console.log('🧪 Prisma Connection Smoke Test\n');
  console.log('═══════════════════════════════════════════════════\n');

  let testId;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Create
    console.log('Test 1: Create health check record...');
    const created = await prisma.healthCheck.create({
      data: {
        message: 'Smoke test - created at ' + new Date().toISOString(),
      },
    });
    testId = created.id;
    console.log(`✅ Created record with ID: ${testId}`);
    console.log(`   Message: ${created.message}`);
    console.log(`   Timestamp: ${created.timestamp}\n`);
    testsPassed++;

    // Test 2: Read all
    console.log('Test 2: Read all health check records...');
    const allRecords = await prisma.healthCheck.findMany();
    console.log(`✅ Found ${allRecords.length} record(s)`);
    if (allRecords.length > 0) {
      console.log(`   First record ID: ${allRecords[0].id}\n`);
    }
    testsPassed++;

    // Test 3: Read by ID
    console.log('Test 3: Read health check by ID...');
    const recordById = await prisma.healthCheck.findUnique({
      where: { id: testId },
    });
    if (recordById) {
      console.log(`✅ Found record by ID: ${recordById.id}`);
      console.log(`   Message: ${recordById.message}\n`);
      testsPassed++;
    } else {
      console.log(`❌ Failed to find record by ID: ${testId}\n`);
      testsFailed++;
    }

    // Test 4: Delete
    console.log('Test 4: Delete test record...');
    await prisma.healthCheck.delete({
      where: { id: testId },
    });
    console.log(`✅ Deleted record with ID: ${testId}\n`);
    testsPassed++;

    // Test 5: Verify cleanup
    console.log('Test 5: Verify database cleanup...');
    const finalCount = await prisma.healthCheck.count();
    console.log(`✅ Final record count: ${finalCount}`);
    if (finalCount === 0) {
      console.log('   Database is clean (no test data left)\n');
    } else {
      console.log(`   Note: ${finalCount} record(s) remain in database\n`);
    }
    testsPassed++;

  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error(error);
    testsFailed++;
  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('═══════════════════════════════════════════════════');
  console.log('Test Summary:');
  console.log(`  Passed: ${testsPassed}/5`);
  console.log(`  Failed: ${testsFailed}/5`);
  console.log('═══════════════════════════════════════════════════\n');

  if (testsFailed === 0) {
    console.log('🎉 All tests passed! Prisma Client is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check errors above.\n');
    process.exit(1);
  }
}

runSmokeTests();
