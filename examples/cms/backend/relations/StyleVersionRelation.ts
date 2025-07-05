import { Relation, Property } from 'interaqt';
import { Style } from '../entities/Style';
import { Version } from '../entities/Version';

// Many-to-many relation between Style and Version for version snapshots
export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'styles',
  type: 'n:n',
  properties: [
    // Store snapshot of style data at version creation time
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumbKey', type: 'string' }),
    Property.create({ name: 'priority', type: 'number' }),
    Property.create({ name: 'originalStyleId', type: 'string' }),
    Property.create({ 
      name: 'snapshotCreatedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
}); 