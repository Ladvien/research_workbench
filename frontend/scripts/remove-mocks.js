#!/usr/bin/env node

/**
 * Script to remove mocks from frontend test files and configure them for real backend integration
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Directories to process
const testDirectories = [
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  'src/**/*.spec.ts',
  'src/**/*.spec.tsx'
];

// Files to skip (already converted or not applicable)
const skipFiles = [
  'src/test-utils/testConfig.ts',
  'src/services/auth.test.ts' // Already converted
];

// Patterns to remove or replace
const mockPatterns = [
  // Remove vi.mock() calls
  {
    pattern: /^\/\/\s*Mock.*?\n|vi\.mock\(.*?\);?\n/gm,
    replacement: ''
  },

  // Remove global fetch mocks
  {
    pattern: /const\s+mockFetch\s*=\s*vi\.fn\(\);\s*\n/g,
    replacement: ''
  },
  {
    pattern: /global\.fetch\s*=\s*mockFetch;\s*\n/g,
    replacement: ''
  },

  // Remove mockFetch.mockClear() calls
  {
    pattern: /\s*mockFetch\.mockClear\(\);\s*\n/g,
    replacement: ''
  },

  // Remove vi.clearAllMocks() calls
  {
    pattern: /\s*vi\.clearAllMocks\(\);\s*\n/g,
    replacement: ''
  },

  // Update imports to remove vi and add test config
  {
    pattern: /import\s+\{([^}]*),?\s*vi\s*,?([^}]*)\}\s+from\s+['"]vitest['"];/,
    replacement: (match, p1, p2) => {
      const imports = [p1, p2].filter(x => x && x.trim()).join(', ').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '');
      return `import { ${imports} } from 'vitest';`;
    }
  }
];

// Import to add for test config
const testConfigImport = "import { TEST_CONFIG, waitForBackend, cleanupTestData } from '../test-utils/testConfig';";

function processFile(filePath) {
  console.log(`Processing: ${filePath}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Apply pattern replacements
  mockPatterns.forEach(({ pattern, replacement }) => {
    const newContent = typeof replacement === 'function'
      ? content.replace(pattern, replacement)
      : content.replace(pattern, replacement);

    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  });

  // Add test config import if not present and file uses TEST_CONFIG
  if (content.includes('TEST_CONFIG') && !content.includes('test-utils/testConfig')) {
    const lines = content.split('\n');
    const lastImportIndex = lines.findLastIndex(line => line.startsWith('import '));
    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, testConfigImport);
      content = lines.join('\n');
      modified = true;
    }
  }

  // Remove empty lines that result from removals (more than 2 consecutive empty lines)
  content = content.replace(/\n{3,}/g, '\n\n');

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Modified: ${filePath}`);
  } else {
    console.log(`- No changes: ${filePath}`);
  }
}

function main() {
  console.log('Removing mocks from frontend test files...\n');

  // Find all test files
  const allFiles = [];
  testDirectories.forEach(pattern => {
    const files = glob.sync(pattern, { cwd: process.cwd() });
    allFiles.push(...files);
  });

  // Filter out files to skip
  const filesToProcess = allFiles.filter(file =>
    !skipFiles.some(skipFile => file.includes(skipFile))
  );

  console.log(`Found ${filesToProcess.length} test files to process\n`);

  // Process each file
  filesToProcess.forEach(processFile);

  console.log('\n✅ Mock removal completed!');
  console.log('\nNext steps:');
  console.log('1. Update individual test files to use real API calls');
  console.log('2. Replace mock assertions with real backend assertions');
  console.log('3. Add proper async/await and timeouts for API calls');
  console.log('4. Test with real backend running on localhost:4512');
}

if (require.main === module) {
  main();
}

module.exports = { processFile, mockPatterns };