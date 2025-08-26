import * as fs from 'fs';
import * as path from 'path';

/**
 * Reset the project to a specific Task level
 * @param taskLevel - The task level to reset to (0=complete reset, 1=keep Task 1, 2=keep Task 1&2, 3=keep all)
 */
async function resetProject(taskLevel: number = 0) {
  const projectRoot = process.cwd();
  
  console.log(`Resetting project to Task ${taskLevel} state...`);
  
  // Define task outputs for each level
  const taskOutputs = {
    // Task 1 outputs
    task1: {
      docs: ['STATUS.json'],
      requirements: ['detailed-requirements.md', 'test-cases.md', 'interaction-matrix.md'],
    },
    // Task 2 outputs (in addition to Task 1)
    task2: {
      docs: ['data-design.json', 'interaction-design.md', 'computation-analysis.json'],
    },
    // Task 3 outputs (in addition to Task 1 & 2)
    task3: {
      docs: [
        'computation-implementation-plan.json',
        'business-rules-and-permission-control-implementation-plan.json'
      ],
      tests: ['basic.test.ts', 'permission.test.ts'],
      backend: ['index.ts'], // This will be fully implemented
      errors: true, // May contain error documents
    }
  };

  // Helper function to delete file safely
  const deleteFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  };

  // Helper function to delete directory safely
  const deleteDirectory = (dirPath: string) => {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
    return false;
  };

  // Reset based on task level
  if (taskLevel < 3) {
    // Delete Task 3 outputs
    console.log('Removing Task 3 outputs...');
    
    // Delete test files from Task 3
    taskOutputs.task3.tests.forEach(file => {
      const filePath = path.join(projectRoot, 'tests', file);
      if (deleteFile(filePath)) {
        console.log(`  Deleted: tests/${file}`);
      }
    });

    // Delete Task 3 docs
    taskOutputs.task3.docs.forEach(file => {
      const filePath = path.join(projectRoot, 'docs', file);
      if (deleteFile(filePath)) {
        console.log(`  Deleted: docs/${file}`);
      }
    });

    // Clean errors directory
    const errorsDir = path.join(projectRoot, 'docs', 'errors');
    if (fs.existsSync(errorsDir)) {
      const files = fs.readdirSync(errorsDir);
      files.forEach(file => {
        const filePath = path.join(errorsDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          deleteDirectory(filePath);
        } else {
          deleteFile(filePath);
        }
      });
      console.log('  Cleaned: docs/errors/ directory');
    }

    // Delete backend/index.ts 
    const backendIndexPath = path.join(projectRoot, 'backend', 'index.ts');
    if (deleteFile(backendIndexPath)) {
      console.log('  Deleted: backend/index.ts');
    }
  }

  if (taskLevel < 2) {
    // Delete Task 2 outputs
    console.log('Removing Task 2 outputs...');
    
    taskOutputs.task2.docs.forEach(file => {
      const filePath = path.join(projectRoot, 'docs', file);
      if (deleteFile(filePath)) {
        console.log(`  Deleted: docs/${file}`);
      }
    });
  }

  if (taskLevel < 1) {
    // Delete Task 1 outputs
    console.log('Removing Task 1 outputs...');
    
    // Delete requirements files (except requirements.md)
    const requirementsDir = path.join(projectRoot, 'requirements');
    if (fs.existsSync(requirementsDir)) {
      taskOutputs.task1.requirements.forEach(file => {
        const filePath = path.join(requirementsDir, file);
        if (deleteFile(filePath)) {
          console.log(`  Deleted: requirements/${file}`);
        }
      });
    }

    // Delete STATUS.json
    const statusFile = path.join(projectRoot, 'docs', 'STATUS.json');
    if (deleteFile(statusFile)) {
      console.log('  Deleted: docs/STATUS.json');
    }
    
    // Clean the entire docs directory if resetting to Task 0
    const docsDir = path.join(projectRoot, 'docs');
    if (fs.existsSync(docsDir)) {
      const files = fs.readdirSync(docsDir);
      files.forEach(file => {
        const filePath = path.join(docsDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          deleteDirectory(filePath);
        } else {
          deleteFile(filePath);
        }
      });
    }
  }

  // Clean up test directory - keep only template files
  const testsDir = path.join(projectRoot, 'tests');
  if (fs.existsSync(testsDir) && taskLevel < 3) {
    const files = fs.readdirSync(testsDir);
    for (const file of files) {
      if (!file.endsWith('.example.test.ts') && !file.endsWith('.template.test.ts')) {
        const filePath = path.join(testsDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          deleteDirectory(filePath);
        } else if (!taskOutputs.task3.tests.includes(file) || taskLevel < 3) {
          // Don't double-delete Task 3 test files
          deleteFile(filePath);
        }
      }
    }
  }



  
  // 5. Delete all files in errors directory but keep the directory
  const errorsDir = path.join(projectRoot, 'errors');
  if (fs.existsSync(errorsDir)) {
    const files = fs.readdirSync(errorsDir);
    for (const file of files) {
      const filePath = path.join(errorsDir, file);
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
    console.log('Cleaned errors directory (kept directory structure)');
  }

  // Update STATUS.json based on target task level
  if (taskLevel > 0 && taskLevel <= 3) {
    const docsDir = path.join(projectRoot, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    
    const statusContent: {
      currentTask: string;
      completed: boolean;
      completedItems: string[];
    } = {
      currentTask: `Task ${taskLevel}`,
      completed: true,
      completedItems: []
    };
    
    if (taskLevel >= 1) {
      statusContent.completedItems.push(
        'detailed-requirements.md created',
        'test-cases.md created',
        'interaction-matrix.md created'
      );
    }
    
    if (taskLevel >= 2) {
      statusContent.completedItems.push(
        'data-design.json created',
        'interaction-design.md created',
        'computation-analysis.json created'
      );
    }
    
    if (taskLevel >= 3) {
      statusContent.completedItems = [
        'Task 1: Requirements Analysis - COMPLETE',
        'Task 2: Design and Analysis - COMPLETE',
        'Task 3: Code Generation and Progressive Testing - COMPLETE',
        'All tests passing',
        'Project ready for production'
      ];
      statusContent.currentTask = 'COMPLETE';
    }
    
    fs.writeFileSync(
      path.join(docsDir, 'STATUS.json'),
      JSON.stringify(statusContent, null, 2),
      'utf8'
    );
    console.log(`Updated: docs/STATUS.json to reflect Task ${taskLevel} completion state`);
  }

  console.log(`\nProject successfully reset to Task ${taskLevel} state!`);
  
  if (taskLevel === 0) {
    console.log('Ready to start from the beginning (Task 1).');
  } else if (taskLevel === 1) {
    console.log('Task 1 outputs preserved. Ready to continue with Task 2.');
  } else if (taskLevel === 2) {
    console.log('Task 1 & 2 outputs preserved. Ready to continue with Task 3.');
  } else if (taskLevel === 3) {
    console.log('All task outputs preserved. Project remains in completed state.');
  }
}

// Parse command line arguments
const taskLevel = process.argv[2] ? parseInt(process.argv[2], 10) : 0;

// Validate the task level
if (isNaN(taskLevel) || taskLevel < 0 || taskLevel > 3) {
  console.error('Error: Task level must be a number between 0 and 3');
  console.log('\nUsage: npm run reset [taskLevel]');
  console.log('  taskLevel 0: Complete reset (delete all task outputs)');
  console.log('  taskLevel 1: Keep Task 1 outputs, delete Task 2 & 3');
  console.log('  taskLevel 2: Keep Task 1 & 2 outputs, delete Task 3');
  console.log('  taskLevel 3: Keep all task outputs');
  console.log('\nExample: npm run reset 1');
  process.exit(1);
}

resetProject(taskLevel).catch(console.error);
