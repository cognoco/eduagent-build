import fs from 'node:fs';
import path from 'node:path';

const srcGenDir = path.join(process.cwd(), 'src', 'gen');
const distGenDir = path.join(process.cwd(), 'dist', 'gen');

// Copy gen/ directory
fs.cpSync(srcGenDir, distGenDir, { recursive: true });

// Create stub .js file for module resolution
const stubPath = path.join(distGenDir, 'openapi.js');
fs.writeFileSync(stubPath, '// Empty stub for TypeScript module resolution\n');

console.log('✓ Copied gen/ directory to dist/gen/');
console.log('✓ Created openapi.js stub');
