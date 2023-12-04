import {Entity, Property, PropertyTypes,} from "@interaqt/shared";

export const userEntity = Entity.create({ name: 'User' })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
userEntity.properties.push(nameProperty, ageProperty)


