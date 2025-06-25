import { startServer } from "./server";
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt';
import { entities, relations, interactions, activities } from './src/index.js';

const system = new MonoSystem(new PGLiteDB('pgdata'));
system.conceptClass = KlassByName;

const controller = new Controller(system, entities, relations, activities, interactions, [], []);
await controller.setup(true);