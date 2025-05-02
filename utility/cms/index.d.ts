import { Entity, Interaction, KlassInstance, Property, Relation } from '@interaqt/runtime';
type ContentResult = {
    contentEntity: KlassInstance<typeof Entity, false>;
    ownerRelation: KlassInstance<typeof Relation, false>;
    interactions: {
        create: KlassInstance<typeof Interaction, false>;
        update: KlassInstance<typeof Interaction, false>;
        delete: KlassInstance<typeof Interaction, false>;
        list: KlassInstance<typeof Interaction, false>;
        readOne: KlassInstance<typeof Interaction, false>;
    };
};
export declare function createContent(name: string, properties: KlassInstance<typeof Property, false>[], userEntity: KlassInstance<typeof Entity, false>): ContentResult;
export declare const createRequiredAttributive: (propName: string) => import("@interaqt/runtime").InertKlassInstance<{
    stringContent: {
        type: "string";
    };
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
    isRef: {
        type: "boolean";
    };
}>;
export declare const createUniquePropertyAttributive: (entityName: string, propName: string) => import("@interaqt/runtime").InertKlassInstance<{
    stringContent: {
        type: "string";
    };
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
    isRef: {
        type: "boolean";
    };
}>;
export declare const createUniqueContentAttributive: (entityName: string) => import("@interaqt/runtime").InertKlassInstance<{
    stringContent: {
        type: "string";
    };
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
    isRef: {
        type: "boolean";
    };
}>;
export {};
//# sourceMappingURL=index.d.ts.map