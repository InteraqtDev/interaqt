import { Controller, MonoSystem, PGLiteDB } from 'interaqt';
import { entities, relations, interactions } from './backend/index.js';

const system = new MonoSystem(new PGLiteDB());
const controller = new Controller({
  system: system,
  entities: entities,
  relations: relations,
  activities: [],
  interactions: interactions,
  dict: [],
  recordMutationSideEffects: []
});

async function setup() {
  await controller.setup();
}

export { controller, setup };