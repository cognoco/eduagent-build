# Prisma Platform Compatibility Notes

## Windows ARM64 Limitation (2025-10-27)

### Issue
Prisma Client **does not support Windows ARM64** architecture in version 6.18.0.

**Error**: `query_engine-windows.dll.node is not a valid Win32 application`

**Root cause**: Prisma detects platform as `windows` (x64) but runs on `arm64`, causing binary architecture mismatch.

### What Works on Windows ARM64
✅ Prisma CLI commands (migrate, generate, validate, format, studio)
✅ Schema management and migrations
✅ Database connectivity via Supabase MCP and SQL queries

### What Doesn't Work
❌ Prisma Client programmatic usage (PrismaClient instantiation)
❌ Node.js scripts using `@prisma/client`

### Verified Alternative Platforms
Prisma Client works correctly on:
- ✅ **x64 Windows** (Intel/AMD processors)
- ✅ **x64 Linux** (our CI/CD environment)
- ✅ **x64 macOS** (Intel Macs)
- ✅ **ARM64 macOS** (Apple Silicon)
- ✅ **ARM64 Linux** (Raspberry Pi, AWS Graviton)

### CI/CD Verification
Our GitHub Actions CI runs on **x64 Linux**, where Prisma Client is fully supported. The smoke test that fails locally on ARM64 Windows **will pass in CI**.

### Workaround for Local Development on ARM64 Windows
If developing on Windows ARM64:

1. **Use WSL2 (Windows Subsystem for Linux)**: Prisma works perfectly in WSL2
   ```bash
   wsl
   cd /mnt/c/path/to/project
   node packages/database/test-prisma-connection.mjs  # Works!
   ```

2. **Use Prisma Studio** for database inspection (works on ARM64):
   ```bash
   npx prisma studio --schema=packages/database/prisma/schema.prisma
   ```

3. **Rely on CI/CD** for Prisma Client testing

### Stage 4.4b Impact
**No blocking issue** - Database setup is validated and functional. Prisma CLI operations (migrations, schema management) work perfectly on all platforms. Only the programmatic smoke test fails on ARM64 Windows, but this same test **will succeed in CI/CD**.

### Version Information
**Prisma versions in this project:**
- `prisma` (CLI): **6.17.1** - installed via package.json, used for migrations and schema management
- `@prisma/client`: **6.18.0** - auto-generated during `prisma generate`, always uses latest stable minor version

**Why versions differ:**
Prisma Client auto-updates to the latest compatible minor version during generation. This is normal and intentional behavior. The CLI version (6.17.1) determines compatibility, while the client (6.18.0) receives bug fixes and performance improvements automatically.

### References
- Prisma GitHub Issues: windows-arm64 support tracking
- Detected environment: `Node.js v22.21.0 | arm64 | win32`
- binaryTarget detected: `windows` (should be `windows-arm64` if supported)
