## After: `nx g @nx/react:app <name>` (Future - mobile apps)

### Issue
React Native apps may default to different patterns than our Next.js web app.

### Required Actions

**1. Verify test location**

Follow "After: `nx g @nx/js:lib`" checklist to ensure tests are in `src/`.

**2. Verify TypeScript configuration**

Follow "After: `nx g @nx/jest:configuration`" checklist to ensure `moduleResolution: nodenext`.

**3. Check for platform-specific differences**

Document any necessary platform-specific patterns in this checklist if they differ from web standards.

### Notes

This section will be expanded when mobile app is added in Phase 2.

---
