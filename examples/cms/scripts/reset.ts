import * as fs from 'fs';
import * as path from 'path';

async function resetProject() {
  const projectRoot = process.cwd();
  
  // 1. Delete all files in requirements directory except requirements.md
  const requirementsDir = path.join(projectRoot, 'requirements');
  if (fs.existsSync(requirementsDir)) {
    const files = fs.readdirSync(requirementsDir);
    for (const file of files) {
      if (file !== 'requirements.md') {
        const filePath = path.join(requirementsDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }
    console.log('Cleaned requirements directory (kept requirements.md)');
  }
  
  // 2. Delete all files in backend directory and recreate index.ts
  const backendDir = path.join(projectRoot, 'backend');
  if (fs.existsSync(backendDir)) {
    fs.rmSync(backendDir, { recursive: true, force: true });
  }
  
  // Create backend directory
  fs.mkdirSync(backendDir, { recursive: true });
  
  // Create new index.ts file
  const indexContent = `export const entities = []
export const relations = []
export const activities = []
export const interactions = []
export const dicts = []
`;
  
  fs.writeFileSync(path.join(backendDir, 'index.ts'), indexContent, 'utf8');
  console.log('Recreated backend/index.ts');

  // 3. Delete all files in tests directory
  const testsDir = path.join(projectRoot, 'tests');
  if (fs.existsSync(testsDir)) {
    fs.rmSync(testsDir, { recursive: true, force: true });
    console.log('Deleted tests directory');
  }
  
  console.log('Project reset completed successfully!');
}

resetProject().catch(console.error);
