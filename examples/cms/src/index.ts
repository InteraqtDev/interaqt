import { entities as baseEntities } from './entities.js';
import './entities-computed.js'; // Import to apply computed properties
import { relations } from './relations.js';
import { interactions } from './interactions.js';
import { activities, transforms } from './activities.js';

// Export all components for the CMS system
export const entities = baseEntities;
export { relations, interactions, activities, transforms };

// Export individual entities and interactions for external use
export * from './entities.js';
// Computed properties are included in the base entities
export * from './relations.js';
export * from './interactions.js';
export * from './activities.js';