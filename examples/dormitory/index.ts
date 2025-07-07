import { Controller, MonoSystem, PGLiteDB } from 'interaqt';
import { entities, relations, interactions } from './backend/index.js';

const system = new MonoSystem(new PGLiteDB());
const controller = new Controller(
  system,
  entities,
  relations,
  [],  // activities
  interactions,
  [],  // dicts
  []   // side effects
);

async function setup() {
  await controller.setup();
}

export { controller, setup };