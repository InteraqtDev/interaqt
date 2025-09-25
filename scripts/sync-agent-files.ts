#!/usr/bin/env node

/**
 * Script to sync agent-related files from examples projects back to the root agent directory
 * Usage: npm run sync:agent -- <project-name>
 * Example: npm run sync:agent -- cms
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the files and directories to sync
const SYNC_ITEMS = [
  'agentspace',
  'CLAUDE.md'
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(src: string, dest: string) {
  // Create destination directory if it doesn't exist
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
      console.log(`  Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

async function syncAgentFiles(projectName: string) {
  const rootDir = path.resolve(__dirname, '..');
  const exampleDir = path.join(rootDir, 'examples', projectName);
  const agentDir = path.join(rootDir, 'agent');

  // Check if the example project exists
  if (!(await pathExists(exampleDir))) {
    console.error(`❌ Example project '${projectName}' not found at: ${exampleDir}`);
    process.exit(1);
  }

  console.log(`🔄 Syncing agent files from examples/${projectName} to agent/`);
  console.log(`  Source: ${exampleDir}`);
  console.log(`  Destination: ${agentDir}`);
  console.log('');

  let syncedCount = 0;

  for (const item of SYNC_ITEMS) {
    const srcPath = path.join(exampleDir, item);
    const destPath = path.join(agentDir, item);

    if (await pathExists(srcPath)) {
      const stat = await fs.stat(srcPath);
      
      if (stat.isDirectory()) {
        console.log(`📁 Syncing directory: ${item}`);
        // Backup existing directory if it exists
        if (await pathExists(destPath)) {
          const backupPath = `${destPath}.backup.${Date.now()}`;
          await fs.rename(destPath, backupPath);
          console.log(`  Backed up existing directory to: ${backupPath}`);
        }
        await copyDirectory(srcPath, destPath);
        syncedCount++;
      } else if (stat.isFile()) {
        console.log(`📄 Syncing file: ${item}`);
        // Backup existing file if it exists
        if (await pathExists(destPath)) {
          const backupPath = `${destPath}.backup.${Date.now()}`;
          await fs.copyFile(destPath, backupPath);
          console.log(`  Backed up existing file to: ${backupPath}`);
        }
        await fs.copyFile(srcPath, destPath);
        console.log(`  Copied: ${srcPath} -> ${destPath}`);
        syncedCount++;
      }
      console.log('');
    } else {
      console.log(`⚠️  Skipping ${item} - not found in examples/${projectName}`);
    }
  }

  if (syncedCount === 0) {
    console.log('❌ No files were synced. Make sure the example project contains agent-related files.');
  } else {
    console.log(`✅ Successfully synced ${syncedCount} item(s) from examples/${projectName} to agent/`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: Please specify an example project name');
    console.error('Usage: npm run sync:agent -- <project-name>');
    console.error('Example: npm run sync:agent -- cms');
    process.exit(1);
  }

  const projectName = args[0];
  
  try {
    await syncAgentFiles(projectName);
  } catch (error) {
    console.error('❌ Error during sync:', error);
    process.exit(1);
  }
}

main();
