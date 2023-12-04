import {Entity, Property} from "@interaqt/shared";

export const messageEntity = Entity.create({
    name: 'Message',
    properties: [Property.create({
        name: 'content',
        type: 'string',
        collection: false,
    })]
})