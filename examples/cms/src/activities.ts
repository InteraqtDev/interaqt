import { Transform } from 'interaqt';
import { StyleComputed, UserComputed, VersionComputed } from './entities-computed.js';
import { UserStyleRelation, UserVersionRelation } from './relations.js';

// Note: In this CMS implementation, we're using simple CRUD operations
// rather than complex Transform operations. The data changes will be
// handled directly through the storage system rather than reactive transforms.


// For now, we'll use empty activities array since the CMS doesn't need complex workflows
// The data transformations are handled by the Transform functions above
export const activities: any[] = [];

// No transforms needed for this simplified CMS implementation
export const transforms: any[] = [];