import {Entity, Property} from "@interaqt/runtime";

export const messageEntity = Entity.create({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})