import {Entity, Property, PropertyTypes, USER_ENTITY,} from '@';

export const UserEntity = Entity.create({ name: USER_ENTITY })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
UserEntity.properties.push(nameProperty, ageProperty)


