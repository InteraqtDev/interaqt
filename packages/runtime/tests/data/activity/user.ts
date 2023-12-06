import {Entity, Property, PropertyTypes, } from "@interaqt/shared";
import {USER_ENTITY} from "@interaqt/runtime";

export const UserEntity = Entity.create({ name: USER_ENTITY })
const nameProperty = Property.create({ name: 'name', type: PropertyTypes.String })
const ageProperty = Property.create({ name: 'age', type: PropertyTypes.Number })
UserEntity.properties.push(nameProperty, ageProperty)


