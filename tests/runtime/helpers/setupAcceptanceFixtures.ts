/**
 * Shared fixtures for the setup({ acceptModelHashes }) suites (one2x-ai/mesh#2826):
 * tests/runtime/setupAcceptModelHashes.spec.ts (PGLite / SQLite / env-gated MySQL) and the
 * real-PostgreSQL block in tests/runtime/postgresqlMigration.spec.ts.
 */
import {
    Action,
    Controller,
    Count,
    Dictionary,
    Entity,
    Interaction,
    InteractionEventEntity,
    KlassByName,
    MatchExp,
    MonoSystem,
    NonNullConstraint,
    Payload,
    PayloadItem,
    Property,
    Relation,
    StateMachine,
    StateNode,
    StateTransfer,
    UniqueConstraint,
    readMigrationManifest,
    type SystemLogger,
    type SystemLogType,
} from "interaqt";
import { migrateWithApproval } from "./migrationApproval.js";

// The 4.12.0 error text, written out literally so a change to the manifest constants or the
// wording is caught as a default-path regression.
export const DEFAULT_MISMATCH_MESSAGE = "Model manifest mismatch. Call controller.generateMigrationDiff(), review it, then call controller.migrate({ approvedDiff }). Manifest key: _MigrationManifest_/current";

export type ModelShape = {
    sku?: boolean;
    skuUnique?: boolean;
    skuRequired?: boolean;
    category?: boolean;
    priceType?: "number" | "string";
};

export function buildEntities(shape: ModelShape = {}) {
    const Product = new Entity({
        name: "AcceptProduct",
        properties: [
            new Property({ name: "name", type: "string" }, { uuid: "accept-product-name" }),
            new Property({ name: "price", type: shape.priceType ?? "number" }, { uuid: "accept-product-price" }),
            ...(shape.sku ? [new Property({ name: "sku", type: "string" }, { uuid: "accept-product-sku" })] : []),
        ],
        ...(shape.skuUnique || shape.skuRequired ? {
            constraints: [
                ...(shape.skuUnique ? [new UniqueConstraint({ name: "accept_sku_unique", properties: ["sku"] }, { uuid: "accept-product-sku-unique" })] : []),
                ...(shape.skuRequired ? [new NonNullConstraint({ name: "accept_sku_required", property: "sku" }, { uuid: "accept-product-sku-required" })] : []),
            ],
        } : {}),
    }, { uuid: "accept-product" });
    const entities = [Product];
    if (shape.category) {
        entities.push(new Entity({
            name: "AcceptCategory",
            properties: [new Property({ name: "title", type: "string" }, { uuid: "accept-category-title" })],
        }, { uuid: "accept-category" }));
    }
    return entities;
}

export function recordingLogger() {
    const infos: SystemLogType[] = [];
    const logger: SystemLogger = {
        error: () => {},
        info: (arg) => { infos.push(arg); },
        debug: () => {},
        child: () => logger,
    };
    return { logger, infos };
}

export type AnyDB = ConstructorParameters<typeof MonoSystem>[0];

export function controllerFor(db: AnyDB, shape: ModelShape = {}, logger?: SystemLogger) {
    const system = new MonoSystem(db, logger);
    system.conceptClass = KlassByName;
    return new Controller({ system, entities: buildEntities(shape), relations: [] });
}

export async function install(db: AnyDB, shape: ModelShape = {}) {
    const controller = controllerFor(db, shape);
    await controller.setup(true);
    return { controller, hash: (await readMigrationManifest(controller))!.modelHash };
}

export async function migrateTo(db: AnyDB, shape: ModelShape) {
    const controller = controllerFor(db, shape);
    await migrateWithApproval(controller);
    return { controller, hash: (await readMigrationManifest(controller))!.modelHash };
}

/**
 * A model that exercises every column shape the type comparison must agree on: logical id,
 * row id, string / number / boolean / timestamp / object / json / collection columns, an n:1
 * relation merged into the source table, a 1:1 relation, a symmetric n:n relation table, a
 * filtered entity, a Count property, a global Dictionary, a StateMachine property with its
 * bound-state column, and the interaction event table. `withExtra` adds one unrelated entity
 * (the expand step). `dictionary: false` drops the Dictionary, whose default-value write at
 * install needs storage transactions (unavailable on MySQL).
 */
export function buildRichModel(withExtra: boolean, options: { dictionary?: boolean } = {}) {
    const draft = new StateNode({ name: "draft" }, { uuid: "rich-node-draft" });
    const published = new StateNode({ name: "published" }, { uuid: "rich-node-published" });
    const publish = Interaction.create({
        name: "RichPublishPost",
        action: Action.create({ name: "RichPublishPost" }),
        payload: Payload.create({ items: [PayloadItem.create({ name: "postId", type: "string", required: true })] }),
    });
    const User = new Entity({
        name: "RichUser",
        properties: [
            new Property({ name: "name", type: "string" }, { uuid: "rich-user-name" }),
            new Property({ name: "age", type: "number" }, { uuid: "rich-user-age" }),
            new Property({ name: "active", type: "boolean" }, { uuid: "rich-user-active" }),
            new Property({ name: "joinedAt", type: "timestamp" }, { uuid: "rich-user-joined-at" }),
            new Property({ name: "profile", type: "object" }, { uuid: "rich-user-profile" }),
            new Property({ name: "meta", type: "json" }, { uuid: "rich-user-meta" }),
            new Property({ name: "tags", type: "string", collection: true }, { uuid: "rich-user-tags" }),
            new Property({ name: "postCount", type: "number", computation: new Count({ property: "posts" }, { uuid: "rich-user-post-count-computation" }) }, { uuid: "rich-user-post-count" }),
        ],
    }, { uuid: "rich-user" });
    const Post = new Entity({
        name: "RichPost",
        properties: [
            new Property({ name: "title", type: "string" }, { uuid: "rich-post-title" }),
            new Property({
                name: "status",
                type: "string",
                computation: new StateMachine({
                    states: [draft, published],
                    initialState: draft,
                    transfers: [new StateTransfer({
                        trigger: { recordName: InteractionEventEntity.name, type: "create", record: { interactionName: "RichPublishPost" } },
                        current: draft,
                        next: published,
                        computeTarget: (event: any) => ({ id: event.record.payload.postId }),
                    }, { uuid: "rich-post-publish-transfer" })],
                }, { uuid: "rich-post-status-machine" }),
            }, { uuid: "rich-post-status" }),
        ],
    }, { uuid: "rich-post" });
    const Avatar = new Entity({
        name: "RichAvatar",
        properties: [new Property({ name: "url", type: "string" }, { uuid: "rich-avatar-url" })],
    }, { uuid: "rich-avatar" });
    const ActiveUser = new Entity({
        name: "RichActiveUser",
        baseEntity: User,
        matchExpression: MatchExp.atom({ key: "active", value: ["=", true] }),
    }, { uuid: "rich-active-user" });
    const relations = [
        new Relation({ name: "RichUserPosts", source: Post, sourceProperty: "author", target: User, targetProperty: "posts", type: "n:1" }, { uuid: "rich-user-posts" }),
        new Relation({ name: "RichUserAvatar", source: User, sourceProperty: "avatar", target: Avatar, targetProperty: "owner", type: "1:1" }, { uuid: "rich-user-avatar" }),
        new Relation({ name: "RichFriends", source: User, sourceProperty: "friends", target: User, targetProperty: "friends", type: "n:n" }, { uuid: "rich-friends" }),
    ];
    const entities = [User, Post, Avatar, ActiveUser];
    if (withExtra) {
        entities.push(new Entity({
            name: "RichExtra",
            properties: [new Property({ name: "note", type: "string" }, { uuid: "rich-extra-note" })],
        }, { uuid: "rich-extra" }));
    }
    const dict = options.dictionary === false ? [] : [new Dictionary({ name: "richUserTotal", type: "number", collection: false, computation: new Count({ record: User }, { uuid: "rich-user-total-computation" }) }, { uuid: "rich-user-total" })];
    return { entities, relations, dict, eventSources: [publish], publish };
}

export function richController(db: AnyDB, withExtra: boolean, logger?: SystemLogger, options: { dictionary?: boolean } = {}) {
    const model = buildRichModel(withExtra, options);
    const system = new MonoSystem(db, logger);
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: model.entities, relations: model.relations, dict: model.dict, eventSources: model.eventSources });
    return { controller, publish: model.publish };
}

export async function captureError(promise: Promise<unknown>): Promise<Error & { details?: any }> {
    try {
        await promise;
    } catch (error) {
        return error as Error & { details?: any };
    }
    throw new Error("expected the promise to reject");
}

export function setupLogs(infos: SystemLogType[]) {
    return infos.filter(entry => entry.label === "setup" && entry.manifestMode !== undefined);
}
