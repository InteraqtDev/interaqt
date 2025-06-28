import { startServer } from "./server";
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt';
import { entities, relations, interactions, activities } from './backend/index.js';

const system = new MonoSystem(new PGLiteDB('pgdata'));
system.conceptClass = KlassByName;

const controller = new Controller(system, entities, relations, activities, interactions, [], []);
await controller.setup(false);

startServer(controller, {
    port: 3000,
    parseUserId: (headers) => Promise.resolve(headers.authorization?.split(' ')[1]),
    cors: {
        origin: '*'
    }
})