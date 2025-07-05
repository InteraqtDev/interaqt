export * from './entities';
export * from './relations';
export * from './interactions';

import { entities } from './entities';
import { relations } from './relations';
import { interactions } from './interactions';

// Export arrays for convenience
export { entities, relations, interactions };

// Note: NO Controller instantiation here - Controller should be created in test or server files
