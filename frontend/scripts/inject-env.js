#!/usr/bin/env node

/**
 * Inject environment variables into static HTML files at build time
 * Replaces %%PLACEHOLDER%% tokens with actual environment variable values
 */

const fs = require('fs');
const path = require('path');

// Files to process (in the out/ directory after build)
const FILES_TO_PROCESS = [
  'callback-handler.html'
];

// Environment variable mappings
const ENV_REPLACEMENTS = {
  '%%COGNITO_DOMAIN%%': process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
  '%%AWS_REGION%%': process.env.NEXT_PUBLIC_AWS_REGION,
  '%%COGNITO_CLIENT_ID%%': process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
};

// Validate environment variables
const missingVars = [];
for (const [placeholder, value] of Object.entries(ENV_REPLACEMENTS)) {
  if (!value) {
    missingVars.push(placeholder);
  }
}

if (missingVars.length > 0) {
  console.error('❌ Error: Missing required environment variables:');
  console.error('   ' + missingVars.join(', '));
  console.error('\nMake sure your .env.local file contains:');
  console.error('   NEXT_PUBLIC_COGNITO_DOMAIN');
  console.error('   NEXT_PUBLIC_AWS_REGION');
  console.error('   NEXT_PUBLIC_COGNITO_CLIENT_ID');
  process.exit(1);
}

// Process files
const outDir = path.join(__dirname, '..', 'out');

if (!fs.existsSync(outDir)) {
  console.error('❌ Error: out/ directory not found. Run `npm run build` first.');
  process.exit(1);
}

let filesProcessed = 0;
let replacementsMade = 0;

for (const file of FILES_TO_PROCESS) {
  const filePath = path.join(outDir, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Warning: ${file} not found in out/ directory, skipping`);
    continue;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let fileReplacements = 0;

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(ENV_REPLACEMENTS)) {
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = (content.match(regex) || []).length;
      if (matches > 0) {
        content = content.replace(regex, value);
        fileReplacements += matches;
        replacementsMade += matches;
      }
    }

    // Write back
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Processed ${file} (${fileReplacements} replacements)`);
    filesProcessed++;

  } catch (error) {
    console.error(`❌ Error processing ${file}:`, error.message);
    process.exit(1);
  }
}

console.log(`\n✅ Successfully processed ${filesProcessed} file(s) with ${replacementsMade} environment variable injection(s)`);
