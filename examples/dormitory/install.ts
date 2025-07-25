import { MonoSystem, Controller, PGLiteDB } from 'interaqt';
import { entities, relations, interactions } from './backend/index.js';

async function main() {
  console.log('create system...');
  const system = new MonoSystem(new PGLiteDB());

  console.log('create controller...');
  const controller = new Controller({
    system: system,
    entities: entities,
    relations: relations,
    activities: [],
    interactions: interactions,
    dict: [],
    recordMutationSideEffects: []
  });

  console.log('set up...');
  await controller.setup(true);
  
  console.log('CMS backend initialized successfully!');
  process.exit(0);
}

main().catch(console.error);