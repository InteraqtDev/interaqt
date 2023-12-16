/// <reference types="node" />

import { AsyncLocalStorage } from 'async_hooks';
import { Atom } from 'data0';
import cors from 'cors';
import { FastifyLoggerOptions } from 'fastify';
import { MatchExpressionData } from '@interaqt/storage';
import SQLite from 'better-sqlite3';
import { UnwrapReactive } from 'data0';

export declare const Action: Klass<{
    name: {
        type: "string";
        required: true;
    };
}>;

export declare const Activity: Klass<ActivityPublicType>;

export declare const ACTIVITY_RECORD = "_Activity_";

declare class ActivityCall {
    activity: ActivityInstanceType;
    controller: Controller;
    static cache: Map<InertKlassInstance<    {
    name: {
    type: "string";
    collection: false;
    required: true;
    };
    interactions: {
    type: Klass<InteractionPublicType>;
    collection: true;
    defaultValue: (...args: any[]) => (InertKlassInstance<InteractionPublicType> | ReactiveKlassInstance<InteractionPublicType>)[];
    };
    transfers: {
    type: Klass<TransferPublicType>;
    collection: true;
    defaultValue: (...args: any[]) => (InertKlassInstance<TransferPublicType> | ReactiveKlassInstance<TransferPublicType>)[];
    };
    groups: {
    type: Klass<ActivityGroupPublicType>;
    collection: true;
    defaultValue: (...args: any[]) => (InertKlassInstance<ActivityGroupPublicType> | ReactiveKlassInstance<ActivityGroupPublicType>)[];
    };
    gateways: {
    type: Klass<GatewayPublicType>;
    collection: true;
    defaultValue: (...args: any[]) => (InertKlassInstance<GatewayPublicType> | ReactiveKlassInstance<GatewayPublicType>)[];
    };
    events: {
    type: Klass<    {
    name: {
    type: "string";
    required: true;
    };
    }>;
    collection: true;
    defaultValue: (...args: any[]) => (InertKlassInstance<    {
    name: {
    type: "string";
    required: true;
    };
    }> | ReactiveKlassInstance<    {
    name: {
    type: "string";
    required: true;
    };
    }>)[];
    };
    }>, ActivityCall>;
    static from: (activity: ActivityInstanceType, controller: Controller) => ActivityCall;
    graph: Seq;
    uuidToNode: Map<string, GraphNode>;
    uuidToInteractionCall: Map<string, InteractionCall>;
    interactionCallByName: Map<string, InteractionCall>;
    rawToNode: Map<InertKlassInstance<ActivityGroupPublicType> | InertKlassInstance<InteractionPublicType> | InertKlassInstance<GatewayPublicType>, GraphNode>;
    system: System;
    constructor(activity: ActivityInstanceType, controller: Controller);
    buildGraph(activity: ActivityInstanceType, parentGroup?: ActivityGroupNode): Seq;
    create(): Promise<{
        activityId: any;
        state: ActivitySeqStateData;
    }>;
    getNodeByUUID(uuid: string): GraphNode | undefined;
    getState(activityId: string): Promise<any>;
    getActivity(activityId: string): Promise<any>;
    setActivity(activityId: string, value: any): Promise<any>;
    setState(activityId: string, state: any): Promise<any>;
    isStartNode(uuid: string): boolean;
    isEndNode(uuid: string): boolean;
    isActivityHead(interaction: InteractionInstanceType, head?: InteractionLikeNodeBase): boolean;
    callInteraction(inputActivityId: string | undefined, uuid: string, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse>;
    saveUserRefs(activityId: string, interactionCall: InteractionCall, interactionEventArgs: InteractionEventArgs): Promise<void>;
    checkUserRef: (attributive: KlassInstance<typeof Attributive, false>, eventUser: EventUser, activityId: string) => Promise<boolean>;
}

export declare const activityEntity: InertKlassInstance<    {
name: {
type: "string";
collection: false;
required: true;
constraints: {
nameFormat({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
computedData: {
type: Klass<any>[];
collection: false;
required: false;
};
properties: {
type: Klass<    {
name: {
type: "string";
required: true;
collection: false;
constraints: {
format({ name }: {
name: Atom<string>;
}): Atom<boolean>;
length({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
type: {
type: "string";
required: true;
collection: false;
options: PropertyTypes[];
};
collection: {
type: "boolean";
required: true;
collection: false;
defaultValue(): boolean;
};
args: {
computedType: (values: {
type: PropertyTypes;
}) => string;
};
computedData: {
collection: false;
type: Klass<any>[];
required: false;
};
computed: {
required: false;
type: "function";
collection: false;
};
}>;
collection: true;
required: true;
constraints: {
eachNameUnique({ properties }: any): Atom<boolean>;
};
defaultValue(): never[];
};
isRef: {
required: true;
collection: false;
type: "boolean";
defaultValue: () => boolean;
};
}>;

export declare const ActivityGroup: Klass<ActivityGroupPublicType>;

export declare type ActivityGroupInstanceType = KlassInstance<Klass<ActivityGroupPublicType>, false>;

declare type ActivityGroupNode = {
    content: ActivityGroupInstanceType;
    parentGroup?: ActivityGroupNode;
    childSeqs?: Seq[];
} & InteractionLikeNodeBase;

export declare type ActivityGroupPublicType = {
    type: {
        type: 'string';
        required: true;
        collection: false;
    };
    activities: {
        instanceType: UnwrappedActivityInstanceType;
        required: false;
        collection: true;
        defaultValue: (...args: any[]) => UnwrappedActivityInstanceType[];
    };
};

export declare type ActivityInstanceType = KlassInstance<typeof Activity, false>;

declare type ActivityPublicType = {
    name: {
        type: 'string';
        collection: false;
        required: true;
    };
    interactions: {
        type: Klass<InteractionPublicType>;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<Klass<InteractionPublicType>, any>[];
    };
    transfers: {
        type: Klass<TransferPublicType>;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<Klass<TransferPublicType>, any>[];
    };
    groups: {
        type: Klass<ActivityGroupPublicType>;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<Klass<ActivityGroupPublicType>, any>[];
    };
    gateways: {
        type: Klass<GatewayPublicType>;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<Klass<GatewayPublicType>, any>[];
    };
    events: {
        type: typeof Event_2;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<typeof Event_2, any>[];
    };
};

declare type ActivitySeqStateData = {
    current?: InteractionStateData;
};

export declare const Any: Klass<{
    record: {
        type: (Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }> | Klass<RelationPublic>)[];
        collection: false;
        required: true;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare type APIBody = {
    activity?: string;
    interaction?: string;
    activityId?: string;
    payload?: EventPayload;
    query?: EventQuery;
};

export declare const asyncInteractionContext: AsyncLocalStorage<unknown>;

declare type AtomData<T> = {
    type: 'atom';
    data: T;
};

declare type AtomError = {
    name: string;
    type: string;
    stack?: ConceptCheckStack[];
    content?: string;
    error?: any;
};

export declare type AtomHandle<T> = (arg: T) => boolean | Promise<boolean>;

export declare const Attributive: Klass<    {
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

export declare const Attributives: Klass<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

export declare const BoolAtomData: Klass<{
    type: {
        type: "string";
        required: true;
        collection: false;
        defaultValue: () => string;
    };
    data: {
        instanceType: ReactiveKlassInstance<CommonAtomPublic> | InertKlassInstance<CommonAtomPublic>;
        required: true;
        collection: false;
    };
}>;

export declare class BoolExp<T> {
    raw: ExpressionData<T>;
    static atom<U>(data: U): BoolExp<U>;
    constructor(raw: ExpressionData<T>);
    isAtom(): boolean;
    get left(): BoolExp<T>;
    get right(): BoolExp<T>;
    get data(): T;
    toValue(): AtomData<T>;
    static fromValue<T>(value: ExpressionData<T>): BoolExp<T>;
    isExpression(): boolean;
    and(atomValueOrExp: any): BoolExp<T>;
    isAnd(): boolean;
    isOr(): boolean;
    isNot(): boolean;
    or(atomValueOrExp: any): BoolExp<T>;
    not(): BoolExp<T>;
    map<U>(fn: MapFn<T, U>, context?: string[]): BoolExp<U>;
    evaluate(atomHandle: AtomHandle<T>, stack?: any[], inverse?: boolean): true | EvaluateError;
    evaluateAsync(atomHandle: AtomHandle<T>, stack?: any[], inverse?: boolean): Promise<true | EvaluateError>;
}

export declare const BoolExpressionData: Klass<{
    type: {
        type: "string";
        required: true;
        collection: false;
        defaultValue: () => string;
    };
    operator: {
        type: "string";
        required: true;
        collection: false;
        options: string[];
        defaultValue: () => string;
    };
    left: {
        instanceType: InertKlassInstance<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<CommonAtomPublic> | InertKlassInstance<CommonAtomPublic>;
                required: true;
                collection: false;
            };
        }> | UnwrappedBoolExpressionInstanceType<any>;
        required: true;
        collection: false;
    };
    right: {
        instanceType: InertKlassInstance<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<CommonAtomPublic> | InertKlassInstance<CommonAtomPublic>;
                required: true;
                collection: false;
            };
        }> | UnwrappedBoolExpressionInstanceType<any>;
        required: false;
        collection: false;
    };
}>;

export declare type BoolExpressionRawData<T> = {
    type: 'expression';
    operator: 'and' | 'not' | 'or';
    left: ExpressionData<T>;
    right?: ExpressionData<T>;
};

export declare function boolExpToAttributives(obj: BoolExp<KlassInstance<typeof Attributive, false>>): InertKlassInstance<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

export declare function boolExpToConditions(obj: BoolExp<KlassInstance<typeof Condition, false>>): InertKlassInstance<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

export declare function boolExpToDataAttributives(obj: BoolExp<KlassInstance<typeof DataAttributive, false>>): InertKlassInstance<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

declare type CheckUserRef = (attributive: KlassInstance<typeof Attributive, false>, eventUser: EventUser, activityId: string) => Promise<boolean>;

declare type ClassMetaPublicItem = OptionalComputedValueType<OptionalRequiredType<OptionalDefaultValueType<OptionalCollectionType<ClassPropType>>>>;

declare type ClassPropType = {
    type?: Klass<any> | Klass<any>[] | PrimitivePropType;
    instanceType?: Object;
    reactiveInstanceType?: KlassInstance<any, true>;
    computedType?: (...arg: any[]) => string | Function;
    options?: any[] | ((thisProp: any, thisEntity: object) => any[]);
    constraints?: {
        [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string;
    };
};

declare type CommonAtomPublic = {
    content: {
        type: 'function';
        required: true;
        collection: false;
    };
};

export declare const Computation: Klass<    {
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
}>;

export declare const ComputedData: Klass<{
    computeEffect: {
        type: "string";
        collection: false;
        required: true;
    };
    computation: {
        type: "string";
        collection: false;
        required: true;
    };
}>;

declare class ComputedDataHandle {
    controller: Controller;
    computedData: KlassInstance<any, false>;
    dataContext: DataContext;
    static Handles: Map<Klass<any>, typeof ComputedDataHandle>;
    computedDataType: 'global' | 'entity' | 'relation' | 'property';
    userComputeEffect: (mutationEvent: any, mutationEvents: any) => Promise<ComputeEffectResult> | ComputeEffectResult;
    userFullCompute: (...args: any[]) => Promise<any>;
    recordName?: string;
    propertyName?: string;
    stateName?: string;
    constructor(controller: Controller, computedData: KlassInstance<any, false>, dataContext: DataContext);
    setupSchema(): void;
    setupStates(): Promise<void>;
    setupInitialValue(): Promise<void>;
    addEventListener(): void;
    parseComputeEffectFunction(content: string): Function;
    parseFullComputeFunction(content: string): Function;
    parseComputedData(): void;
    getDefaultValue(newRecordId?: any): any;
    insertDefaultPropertyValue(newRecord: any): Promise<any>;
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any;
    recompute(effectResult: ComputeEffectResult, mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): Promise<void>;
    updateState(affectedId: true | string, newValue: any): Promise<void>;
}

declare type ComputedEffect = any;

declare type ComputedValueType = (obj: KlassInstance<any, any>) => any;

declare type ComputeEffectResult = ComputedEffect | ComputedEffect[] | undefined;

export declare interface Concept {
    name: string;
}

export declare interface ConceptAlias extends Concept {
    for: Concept[];
}

declare type ConceptCheckResponse = AtomError | true;

declare type ConceptCheckStack = {
    type: string;
    values: {
        [k: string]: any;
    };
};

export declare type ConceptInstance = any;

export declare type ConceptType = {};

export declare const Condition: Klass<    {
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
}>;

export declare const Conditions: Klass<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

export declare const constraints: {
    entityNameUnique({ entities }: {
        entities: (typeof Entity)[];
    }): Atom<boolean>;
};

export declare class Controller {
    system: System;
    entities: KlassInstance<typeof Entity, false>[];
    relations: KlassInstance<typeof Relation, false>[];
    activities: KlassInstance<typeof Activity, false>[];
    interactions: KlassInstance<typeof Interaction, false>[];
    states: KlassInstance<typeof Property, false>[];
    computedDataHandles: Set<ComputedDataHandle>;
    activityCalls: Map<string, ActivityCall>;
    activityCallsByName: Map<string, ActivityCall>;
    interactionCallsByName: Map<string, InteractionCall>;
    interactionCalls: Map<string, InteractionCall>;
    globals: {
        BoolExp: typeof BoolExp;
    };
    constructor(system: System, entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], activities: KlassInstance<typeof Activity, false>[], interactions: KlassInstance<typeof Interaction, false>[], states?: KlassInstance<typeof Property, false>[]);
    addComputedDataHandle(computedData: KlassInstance<any, false>, host: DataContext["host"], id: DataContext["id"]): void;
    setup(install?: boolean): Promise<void>;
    callbacks: Map<any, Set<SystemCallback>>;
    listen(event: any, callback: SystemCallback): () => void;
    dispatch(event: any, ...args: any[]): Promise<void>;
    callInteraction(interactionId: string, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse>;
    callActivityInteraction(activityCallId: string, interactionCallId: string, activityId: string | undefined, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse>;
}

export declare const Count: Klass<{
    record: {
        type: (Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }> | Klass<RelationPublic>)[];
        collection: false;
        required: true;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare function createClass<T extends KlassMeta>(metadata: T): Klass<T['public']>;

export declare function createDataAPI(handle: DataAPIHandle, config?: DataAPIConfig): DataAPI;

export declare function createInstances(objects: KlassRawInstanceDataType[], reactiveForce?: boolean): Map<string, InertKlassInstance<any> | ReactiveKlassInstance<any>>;

export declare function createInstancesFromString(objStr: string): Map<string, InertKlassInstance<any> | ReactiveKlassInstance<any>>;

export declare function createUserRoleAttributive({ name, isRef }: {
    name?: string;
    isRef?: boolean;
}, options?: KlassOptions | ReactiveKlassOptions): InertKlassInstance<    {
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
}> | ReactiveKlassInstance<    {
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

export declare type DataAPI = DataAPIHandle & DataAPIConfig;

export declare type DataAPIConfig = {
    params?: any[];
    allowAnonymous?: boolean;
};

export declare type DataAPIContext = {
    user: EventUser;
};

export declare type DataAPIHandle = (this: Controller, context: DataAPIContext, ...rest: any[]) => any;

export declare type DataAPIs = {
    [k: string]: DataAPI;
};

export declare const DataAttributive: Klass<    {
    content: {
        type: "function";
        required: true;
        collection: false;
    };
    name: {
        type: "string";
    };
}>;

export declare const DataAttributives: Klass<    {
    content: {
        type: (Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            data: {
                instanceType: ReactiveKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }> | InertKlassInstance<    {
                    content: {
                        type: "function";
                        required: true;
                        collection: false;
                    };
                }>;
                required: true;
                collection: false;
            };
        }> | Klass<    {
            type: {
                type: "string";
                required: true;
                collection: false;
                defaultValue: () => string;
            };
            operator: {
                type: "string";
                required: true;
                collection: false;
                options: string[];
                defaultValue: () => string;
            };
            left: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: true;
                collection: false;
            };
            right: {
                instanceType: InertKlassInstance<    {
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | UnwrappedBoolExpressionInstanceType<any>;
                required: false;
                collection: false;
            };
        }>)[];
        collection: false;
        required: false;
    };
}>;

export declare type Database = {
    open: () => Promise<any>;
    logger: DatabaseLogger;
    scheme: (sql: string, name?: string) => Promise<any>;
    query: <T extends any>(sql: string, values: any[], name?: string) => Promise<T[]>;
    delete: <T extends any>(sql: string, where: any[], name?: string) => Promise<T[]>;
    insert: (sql: string, values: any[], name?: string) => Promise<EntityIdRef>;
    update: (sql: string, values: any[], idField?: string, name?: string) => Promise<EntityIdRef[]>;
    getAutoId: (recordName: string) => Promise<string>;
};

export declare type DatabaseLogger = {
    info: (arg: {
        type: string;
        name: string;
        sql: string;
        params?: any[];
    }) => any;
    child: (fixed: object) => DatabaseLogger;
};

declare type DataContext = {
    host?: KlassInstance<typeof Entity, false> | KlassInstance<typeof Relation, false>;
    id: KlassInstance<typeof Entity, false> | KlassInstance<typeof Relation, false> | KlassInstance<typeof Property, false> | string;
};

export declare function deepClone<T>(obj: T, deepCloneKlass?: boolean): T;

declare type DefaultValueType = (...args: any[]) => any;

export declare interface DerivedConcept extends Concept {
    base?: Concept;
    attributive?: any;
}

export declare const Entity: Klass<{
    name: {
        type: "string";
        collection: false;
        required: true;
        constraints: {
            nameFormat({ name }: {
                name: Atom<string>;
            }): Atom<boolean>;
        };
    };
    computedData: {
        type: Klass<any>[];
        collection: false;
        required: false;
    };
    properties: {
        type: Klass<{
            name: {
                type: "string";
                required: true;
                collection: false;
                constraints: {
                    format({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                    length({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            type: {
                type: "string";
                required: true;
                collection: false;
                options: PropertyTypes[];
            };
            collection: {
                type: "boolean";
                required: true;
                collection: false;
                defaultValue(): boolean;
            };
            args: {
                computedType: (values: {
                    type: PropertyTypes;
                }) => string;
            };
            computedData: {
                collection: false;
                type: Klass<any>[];
                required: false;
            };
            computed: {
                required: false;
                type: "function";
                collection: false;
            };
        }>;
        collection: true;
        required: true;
        constraints: {
            eachNameUnique({ properties }: any): Atom<boolean>;
        };
        defaultValue(): never[];
    };
    isRef: {
        required: true;
        collection: false;
        type: "boolean";
        defaultValue: () => boolean;
    };
}>;

export declare type EntityIdRef = {
    id: string;
    [ROW_ID_ATTR]?: string;
    [k: string]: any;
};

export declare type EvaluateError = {
    data: any;
    stack: any[];
    error: any;
    inverse: boolean;
};

declare const Event_2: Klass<{
    name: {
        type: "string";
        required: true;
    };
}>;
export { Event_2 as Event }

export declare const EVENT_RECORD = "_Event_";

export declare const eventEntity: InertKlassInstance<    {
name: {
type: "string";
collection: false;
required: true;
constraints: {
nameFormat({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
computedData: {
type: Klass<any>[];
collection: false;
required: false;
};
properties: {
type: Klass<    {
name: {
type: "string";
required: true;
collection: false;
constraints: {
format({ name }: {
name: Atom<string>;
}): Atom<boolean>;
length({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
type: {
type: "string";
required: true;
collection: false;
options: PropertyTypes[];
};
collection: {
type: "boolean";
required: true;
collection: false;
defaultValue(): boolean;
};
args: {
computedType: (values: {
type: PropertyTypes;
}) => string;
};
computedData: {
collection: false;
type: Klass<any>[];
required: false;
};
computed: {
required: false;
type: "function";
collection: false;
};
}>;
collection: true;
required: true;
constraints: {
eachNameUnique({ properties }: any): Atom<boolean>;
};
defaultValue(): never[];
};
isRef: {
required: true;
collection: false;
type: "boolean";
defaultValue: () => boolean;
};
}>;

export declare type EventPayload = {
    [k: string]: any;
};

/**
 * 与 interaction 无关，但与当前 query 有关的信息。例如数据获取的 viewPort，innerInteraction 的 activity id
 */
export declare type EventQuery = {
    [k: string]: any;
};

export declare type EventUser = {
    [k: string]: any;
    id: string;
    roles: string[];
};

export declare const Every: Klass<{
    record: {
        type: (Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }> | Klass<RelationPublic>)[];
        collection: false;
        required: true;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
    notEmpty: {
        type: "boolean";
        collection: false;
        required: false;
    };
}>;

export declare type ExpressionData<T> = BoolExpressionRawData<T> | AtomData<T>;

declare type ExtractKlassTypes<REACTIVE extends boolean, COLLECTION extends true | false | undefined, T extends Klass<any>[]> = T extends Array<infer SUB_KLASS> ? SUB_KLASS extends Klass<any> ? KlassProp<REACTIVE, COLLECTION, InertKlassInstance<SUB_KLASS["public"]>> : never : never;

export declare function findRootActivity(interaction: InteractionInstanceType): ActivityInstanceType | null;

export declare function forEachInteraction(activity: ActivityInstanceType, handle: (i: InteractionInstanceType, g?: ActivityGroupInstanceType) => any, parenGroup?: ActivityGroupInstanceType): void;

export declare const Gateway: Klass<GatewayPublicType>;

export declare type GatewayInstanceType = KlassInstance<typeof Gateway, false>;

declare type GatewayNode = {
    uuid: string;
    content: GatewayInstanceType;
    prev: GraphNode[];
    next: GraphNode[];
};

export declare type GatewayPublicType = {
    name: {
        type: 'string';
        required: true;
    };
};

export declare const GetAction: InertKlassInstance<    {
    name: {
        type: "string";
        required: true;
    };
}> | ReactiveKlassInstance<    {
    name: {
        type: "string";
        required: true;
    };
}>;

export declare function getDisplayValue(obj: InertKlassInstance<any>): string | undefined;

export declare function getInstance<T extends Klass<any>>(Type: T): KlassInstance<T, any>[];

export declare function getInteractions(activity: ActivityInstanceType): InertKlassInstance<InteractionPublicType>[];

export declare function getUUID(obj: InertKlassInstance<any>): string;

declare type GraphNode = InteractionNode | ActivityGroupNode | GatewayNode;

declare type HandleAttributive = (attributive: KlassInstance<typeof Attributive, false>) => Promise<boolean>;

export declare const ID_ATTR = "id";

declare class IDSystem {
    db: Database;
    constructor(db: Database);
    setup(): Promise<any>;
    getAutoId(recordName: string): Promise<string>;
}

declare type IfReactiveCollectionProp<REACTIVE extends boolean, COLLECTION extends true | false | undefined, T> = REACTIVE extends true ? (COLLECTION extends true ? UnwrapReactive<T[]> : Atom<T>) : (COLLECTION extends true ? T[] : T);

export declare type InertKlassInstance<T extends NonNullable<KlassMeta["public"]>> = InertKlassInstanceProps<T> & KlassInstancePrimitiveProps;

export declare type InertKlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false, false> & RequiredProps<T, false, false>;

export declare const Interaction: Klass<InteractionPublicType>;

declare class InteractionCall {
    interaction: InteractionInstanceType;
    controller: Controller;
    activitySeqCall?: ActivityCall | undefined;
    system: System;
    constructor(interaction: InteractionInstanceType, controller: Controller, activitySeqCall?: ActivityCall | undefined);
    checkAttributive(inputAttributive: any, interactionEvent: InteractionEventArgs | undefined, attributiveTarget: any): Promise<any>;
    checkMixedAttributive(attributiveData: KlassInstance<typeof Attributive, false>, instance: ConceptInstance): Promise<boolean>;
    createHandleAttributive(AttributiveClass: typeof Attributive | typeof Attributive, interactionEvent: InteractionEventArgs, target: any): (attributive: KlassInstance<typeof Attributive, false>) => Promise<any>;
    checkUser(interactionEvent: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef): Promise<true>;
    checkConcept(instance: ConceptInstance, concept: Concept, attributives?: BoolExpressionRawData<KlassInstance<typeof Attributive, false>>, stack?: ConceptCheckStack[]): Promise<ConceptCheckResponse>;
    isConcept(instance: ConceptInstance, concept: Concept, stack?: ConceptCheckStack[]): Promise<ConceptCheckResponse>;
    isDerivedConcept(concept: Concept): boolean;
    isConceptAlias(concept: Concept): boolean;
    checkAttributives(attributives: BoolExp<KlassInstance<typeof Attributive, false>>, handleAttributive: HandleAttributive, stack?: ConceptCheckStack[]): Promise<ConceptCheckResponse>;
    checkPayload(interactionEvent: InteractionEventArgs): Promise<void>;
    checkCondition(interactionEvent: InteractionEventArgs): Promise<void>;
    runEffects(eventArgs: InteractionEventArgs, activityId: string | undefined, response: InteractionCallResponse): Promise<void>;
    isGetInteraction(): boolean;
    saveEvent(interactionEvent: InteractionEvent): Promise<any>;
    savePayload(payload: InteractionEventArgs["payload"]): Promise<EventPayload>;
    retrieveData(interactionEvent: InteractionEventArgs): Promise<any>;
    check(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse["error"]>;
    call(interactionEventArgs: InteractionEventArgs, activityId?: string, checkUserRef?: CheckUserRef, context?: InteractionContext): Promise<InteractionCallResponse>;
}

declare type InteractionCallResponse = {
    error?: any;
    data?: any;
    event?: InteractionEvent;
    effects?: any[];
    sideEffects?: {
        [k: string]: SideEffectResult;
    };
    context?: {
        [k: string]: any;
    };
};

export declare type InteractionContext = {
    logContext?: any;
    [k: string]: any;
};

export declare type InteractionEvent = {
    interactionId: string;
    interactionName: string;
    activityId?: string;
    args: InteractionEventArgs;
};

export declare type InteractionEventArgs = {
    user: EventUser;
    payload?: EventPayload;
    query?: EventQuery;
};

export declare type InteractionInstanceType = KlassInstance<typeof Interaction, false>;

declare type InteractionLikeNodeBase = {
    uuid: string;
    next: GraphNode | null;
    prev?: GraphNode;
    parentSeq: Seq;
};

declare type InteractionNode = {
    content: InteractionInstanceType;
    parentGroup?: ActivityGroupNode;
} & InteractionLikeNodeBase;

export declare type InteractionPublicType = {
    name: {
        type: 'string';
        collection: false;
        required: true;
    };
    conditions: {
        required: false;
        collection: false;
        type: (typeof Conditions | typeof Condition)[];
    };
    userAttributives: {
        required: false;
        collection: false;
        type: (typeof Attributives | typeof Attributive)[];
    };
    userRef: {
        type: typeof Attributive;
        collection: false;
    };
    action: {
        type: typeof Action;
        collection: false;
        required: true;
    };
    payload: {
        type: typeof Payload;
        collection: false;
    };
    sideEffects: {
        type: typeof SideEffect;
        collection: true;
        defaultValue: (...args: any[]) => KlassInstance<typeof SideEffect, any>[];
    };
    dataAttributives: {
        required: false;
        collection: false;
        type: (typeof DataAttributive | typeof DataAttributives)[];
    };
    data: {
        type: (typeof Entity | typeof Relation | typeof Computation)[];
        required: false;
        collection: false;
    };
    query: {
        type: typeof Query;
        collection: false;
    };
};

declare type InteractionStateData = {
    uuid: string;
    children?: ActivitySeqStateData[];
};

export declare type Klass<T extends NonNullable<KlassMeta["public"]>> = {
    new <U extends KlassOptions | ReactiveKlassOptions>(arg: object, options?: U): U extends ReactiveKlassOptions ? ReactiveKlassInstance<T> : InertKlassInstance<T>;
    create: (arg: KlassInstanceArgs<T>, options?: KlassOptions) => InertKlassInstance<T>;
    createReactive: (arg: KlassInstanceArgs<T>, options?: KlassOptions) => ReactiveKlassInstance<T>;
    displayName: string;
    isKlass: true;
    public: T;
    constraints: KlassMeta['constraints'];
    instances: KlassInstance<Klass<T>, any>[];
    display?: KlassMeta['display'];
    stringify: (instance: InertKlassInstance<T> | ReactiveKlassInstance<T>) => string;
    parse: () => InertKlassInstance<T>;
    check: (data: object) => boolean;
    is: (arg: any) => boolean;
    clone: <V>(obj: V, deep: boolean) => V;
};

export declare const KlassByName: Map<string, Klass<any>>;

export declare type KlassInstance<T extends Klass<any>, U extends boolean> = U extends true ? ReactiveKlassInstance<T["public"]> : InertKlassInstance<T["public"]>;

export declare type KlassInstanceArgs<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, false, true> & RequiredProps<T, false, true>;

export declare type KlassInstancePrimitiveProps = {
    uuid: string;
    _options: KlassOptions;
    _type: string;
};

export declare type KlassMeta = {
    name: string;
    display?: (obj: any) => string;
    constraints?: {
        [ruleName: string]: (thisInstance: object, allInstance: object[]) => Atom<boolean> | boolean;
    };
    public: {
        [key: string]: ClassMetaPublicItem;
    };
    is?: (obj: any) => boolean;
};

export declare type KlassOptions = {
    isReactive?: false;
    uuid?: string;
};

export declare type KlassProp<REACTIVE extends boolean, COLLECTION extends true | false | undefined, T> = IfReactiveCollectionProp<REACTIVE, COLLECTION, T>;

declare type KlassRawInstanceDataType = {
    type: string;
    uuid: string;
    options?: KlassOptions | ReactiveKlassOptions;
    public: KlassInstanceArgs<any>;
};

export declare const MapActivity: Klass<{
    items: {
        type: Klass<{
            activity: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    interactions: {
                        type: Klass<InteractionPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<InteractionPublicType> | ReactiveKlassInstance<InteractionPublicType>)[];
                    };
                    transfers: {
                        type: Klass<TransferPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (ReactiveKlassInstance<TransferPublicType> | InertKlassInstance<TransferPublicType>)[];
                    };
                    groups: {
                        type: Klass<ActivityGroupPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<ActivityGroupPublicType> | ReactiveKlassInstance<ActivityGroupPublicType>)[];
                    };
                    gateways: {
                        type: Klass<GatewayPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<GatewayPublicType> | ReactiveKlassInstance<GatewayPublicType>)[];
                    };
                    events: {
                        type: Klass<{
                            name: {
                                type: "string";
                                required: true;
                            };
                        }>;
                        collection: true;
                        defaultValue: (...args: any[]) => (ReactiveKlassInstance<    {
                            name: {
                                type: "string";
                                required: true;
                            };
                        }> | InertKlassInstance<    {
                            name: {
                                type: "string";
                                required: true;
                            };
                        }>)[];
                    };
                }>;
                collection: false;
                required: true;
            };
            triggerInteractions: {
                type: Klass<InteractionPublicType>;
                collection: true;
                required: false;
            };
            handle: {
                type: "function";
                collection: false;
                required: true;
            };
            computeTarget: {
                type: "function";
                collection: false;
                required: false;
            };
        }>;
        collection: true;
        required: true;
    };
    defaultValue: {
        type: "string";
        collection: false;
        required: false;
    };
}>;

export declare const MapActivityItem: Klass<{
    activity: {
        type: Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
            };
            interactions: {
                type: Klass<InteractionPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<InteractionPublicType> | ReactiveKlassInstance<InteractionPublicType>)[];
            };
            transfers: {
                type: Klass<TransferPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (ReactiveKlassInstance<TransferPublicType> | InertKlassInstance<TransferPublicType>)[];
            };
            groups: {
                type: Klass<ActivityGroupPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<ActivityGroupPublicType> | ReactiveKlassInstance<ActivityGroupPublicType>)[];
            };
            gateways: {
                type: Klass<GatewayPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<GatewayPublicType> | ReactiveKlassInstance<GatewayPublicType>)[];
            };
            events: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                    };
                }>;
                collection: true;
                defaultValue: (...args: any[]) => (ReactiveKlassInstance<    {
                    name: {
                        type: "string";
                        required: true;
                    };
                }> | InertKlassInstance<    {
                    name: {
                        type: "string";
                        required: true;
                    };
                }>)[];
            };
        }>;
        collection: false;
        required: true;
    };
    triggerInteractions: {
        type: Klass<InteractionPublicType>;
        collection: true;
        required: false;
    };
    handle: {
        type: "function";
        collection: false;
        required: true;
    };
    computeTarget: {
        type: "function";
        collection: false;
        required: false;
    };
}>;

declare type MapFn<T, U> = (object: BoolExp<T>, context: string[]) => U | BoolExp<U>;

export declare const MapInteraction: Klass<{
    items: {
        type: Klass<{
            interaction: {
                type: Klass<InteractionPublicType>;
                collection: false;
                required: true;
            };
            handle: {
                type: "function";
                collection: false;
                required: true;
            };
            computeTarget: {
                type: "function";
                collection: false;
                required: false;
            };
        }>;
        collection: true;
        required: true;
    };
    defaultValue: {
        type: "string";
        collection: false;
        required: false;
    };
}>;

export declare const MapInteractionItem: Klass<{
    interaction: {
        type: Klass<InteractionPublicType>;
        collection: false;
        required: true;
    };
    handle: {
        type: "function";
        collection: false;
        required: true;
    };
    computeTarget: {
        type: "function";
        collection: false;
        required: false;
    };
}>;

export declare const MapRecordMutation: Klass<{
    handle: {
        type: "function";
        collection: false;
        required: true;
    };
    computeTarget: {
        type: "function";
        collection: false;
        required: false;
    };
}>;

export declare class MonoSystem implements System {
    logger: SystemLogger;
    conceptClass: Map<string, ReturnType<typeof createClass>>;
    storage: Storage_2;
    constructor(db?: Database, logger?: SystemLogger);
    saveEvent(event: InteractionEvent): Promise<any>;
    getEvent(query?: MatchExpressionData): Promise<InteractionEvent[]>;
    createActivity(activity: any): Promise<any>;
    updateActivity(match: MatchExpressionData, activity: any): Promise<any>;
    getActivity(query?: MatchExpressionData): Promise<any[]>;
    setup(entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], install?: boolean): any;
}

declare type OmitNever<T> = Omit<T, {
    [K in keyof T]: T[K] extends never ? K : never;
}[keyof T]>;

declare type OptionalCollectionType<T> = T & {
    collection?: false;
} | T & {
    collection: true;
};

declare type OptionalComputedValueType<T> = T & {
    computed?: undefined;
} | T & {
    computed: ComputedValueType;
};

declare type OptionalDefaultValueType<T> = T & {
    defaultValue?: undefined;
} | T & {
    defaultValue: DefaultValueType;
};

export declare type OptionalProps<T extends NonNullable<KlassMeta["public"]>, REACTIVE extends true | false, IS_ARG extends true | false> = Partial<OmitNever<{
    [Key in keyof T]: RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ? never : (T[Key]["instanceType"] extends Object ? KlassProp<REACTIVE, T[Key]["collection"], T[Key]["instanceType"]> : (T[Key]['type'] extends Klass<any> ? KlassProp<REACTIVE, T[Key]["collection"], InertKlassInstance<T[Key]['type']['public']>> : T[Key]['type'] extends Klass<any>[] ? ExtractKlassTypes<REACTIVE, T[Key]["collection"], T[Key]['type']> : T[Key]['type'] extends PrimitivePropType ? KlassProp<REACTIVE, T[Key]["collection"], PrimitivePropertyMap[T[Key]['type']]> : never));
}>>;

declare type OptionalRequiredType<T> = T & {
    required?: false;
} | T & {
    required: true;
};

export declare function parse<T>(exp: string, options?: any[], parseAtomNameToObject?: ParseAtomNameToObjectType): BoolExp<T>;

declare type ParseAtomNameToObjectType = (name: string) => any;

export declare const Payload: Klass<{
    items: {
        type: Klass<{
            name: {
                type: "string";
                required: true;
            };
            attributives: {
                type: (Klass<{
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
                }> | Klass<{
                    content: {
                        type: (Klass<{
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                defaultValue: () => string;
                            };
                            data: {
                                instanceType: ReactiveKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }> | InertKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }>;
                                required: true;
                                collection: false;
                            };
                        }> | Klass<{
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                defaultValue: () => string;
                            };
                            operator: {
                                type: "string";
                                required: true;
                                collection: false;
                                options: string[];
                                defaultValue: () => string;
                            };
                            left: {
                                instanceType: InertKlassInstance<    {
                                    type: {
                                        type: "string";
                                        required: true;
                                        collection: false;
                                        defaultValue: () => string;
                                    };
                                    data: {
                                        instanceType: ReactiveKlassInstance<    {
                                            content: {
                                                type: "function";
                                                required: true;
                                                collection: false;
                                            };
                                        }> | InertKlassInstance<    {
                                            content: {
                                                type: "function";
                                                required: true;
                                                collection: false;
                                            };
                                        }>;
                                        required: true;
                                        collection: false;
                                    };
                                }> | UnwrappedBoolExpressionInstanceType<any>;
                                required: true;
                                collection: false;
                            };
                            right: {
                                instanceType: InertKlassInstance<    {
                                    type: {
                                        type: "string";
                                        required: true;
                                        collection: false;
                                        defaultValue: () => string;
                                    };
                                    data: {
                                        instanceType: ReactiveKlassInstance<    {
                                            content: {
                                                type: "function";
                                                required: true;
                                                collection: false;
                                            };
                                        }> | InertKlassInstance<    {
                                            content: {
                                                type: "function";
                                                required: true;
                                                collection: false;
                                            };
                                        }>;
                                        required: true;
                                        collection: false;
                                    };
                                }> | UnwrappedBoolExpressionInstanceType<any>;
                                required: false;
                                collection: false;
                            };
                        }>)[];
                        collection: false;
                        required: false;
                    };
                }>)[];
                collection: false;
            };
            base: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                        constraints: {
                            nameFormat({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    computedData: {
                        type: Klass<any>[];
                        collection: false;
                        required: false;
                    };
                    properties: {
                        type: Klass<{
                            name: {
                                type: "string";
                                required: true;
                                collection: false;
                                constraints: {
                                    format({ name }: {
                                        name: Atom<string>;
                                    }): Atom<boolean>;
                                    length({ name }: {
                                        name: Atom<string>;
                                    }): Atom<boolean>;
                                };
                            };
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                options: PropertyTypes[];
                            };
                            collection: {
                                type: "boolean";
                                required: true;
                                collection: false;
                                defaultValue(): boolean;
                            };
                            args: {
                                computedType: (values: {
                                    type: PropertyTypes;
                                }) => string;
                            };
                            computedData: {
                                collection: false;
                                type: Klass<any>[];
                                required: false;
                            };
                            computed: {
                                required: false;
                                type: "function";
                                collection: false;
                            };
                        }>;
                        collection: true;
                        required: true;
                        constraints: {
                            eachNameUnique({ properties }: any): Atom<boolean>;
                        };
                        defaultValue(): never[];
                    };
                    isRef: {
                        required: true;
                        collection: false;
                        type: "boolean";
                        defaultValue: () => boolean;
                    };
                }>;
                required: true;
                collection: false;
            };
            isRef: {
                type: "boolean";
                collection: false;
                defaultValue: () => boolean;
            };
            required: {
                type: "boolean";
                collection: false;
                defaultValue: () => boolean;
            };
            isCollection: {
                type: "boolean";
                collection: false;
                defaultValue: () => boolean;
            };
            itemRef: {
                collection: false;
                required: false;
                type: (Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                        constraints: {
                            nameFormat({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    computedData: {
                        type: Klass<any>[];
                        collection: false;
                        required: false;
                    };
                    properties: {
                        type: Klass<{
                            name: {
                                type: "string";
                                required: true;
                                collection: false;
                                constraints: {
                                    format({ name }: {
                                        name: Atom<string>;
                                    }): Atom<boolean>;
                                    length({ name }: {
                                        name: Atom<string>;
                                    }): Atom<boolean>;
                                };
                            };
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                options: PropertyTypes[];
                            };
                            collection: {
                                type: "boolean";
                                required: true;
                                collection: false;
                                defaultValue(): boolean;
                            };
                            args: {
                                computedType: (values: {
                                    type: PropertyTypes;
                                }) => string;
                            };
                            computedData: {
                                collection: false;
                                type: Klass<any>[];
                                required: false;
                            };
                            computed: {
                                required: false;
                                type: "function";
                                collection: false;
                            };
                        }>;
                        collection: true;
                        required: true;
                        constraints: {
                            eachNameUnique({ properties }: any): Atom<boolean>;
                        };
                        defaultValue(): never[];
                    };
                    isRef: {
                        required: true;
                        collection: false;
                        type: "boolean";
                        defaultValue: () => boolean;
                    };
                }> | Klass<{
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
                }>)[];
            };
        }>;
        collection: true;
        required: true;
        defaultValue: () => never[];
    };
}>;

export declare const PayloadItem: Klass<{
    name: {
        type: "string";
        required: true;
    };
    attributives: {
        type: (Klass<{
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
        }> | Klass<{
            content: {
                type: (Klass<{
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    data: {
                        instanceType: ReactiveKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }> | InertKlassInstance<    {
                            content: {
                                type: "function";
                                required: true;
                                collection: false;
                            };
                        }>;
                        required: true;
                        collection: false;
                    };
                }> | Klass<{
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        defaultValue: () => string;
                    };
                    operator: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: string[];
                        defaultValue: () => string;
                    };
                    left: {
                        instanceType: InertKlassInstance<    {
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                defaultValue: () => string;
                            };
                            data: {
                                instanceType: ReactiveKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }> | InertKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }>;
                                required: true;
                                collection: false;
                            };
                        }> | UnwrappedBoolExpressionInstanceType<any>;
                        required: true;
                        collection: false;
                    };
                    right: {
                        instanceType: InertKlassInstance<    {
                            type: {
                                type: "string";
                                required: true;
                                collection: false;
                                defaultValue: () => string;
                            };
                            data: {
                                instanceType: ReactiveKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }> | InertKlassInstance<    {
                                    content: {
                                        type: "function";
                                        required: true;
                                        collection: false;
                                    };
                                }>;
                                required: true;
                                collection: false;
                            };
                        }> | UnwrappedBoolExpressionInstanceType<any>;
                        required: false;
                        collection: false;
                    };
                }>)[];
                collection: false;
                required: false;
            };
        }>)[];
        collection: false;
    };
    base: {
        type: Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }>;
        required: true;
        collection: false;
    };
    isRef: {
        type: "boolean";
        collection: false;
        defaultValue: () => boolean;
    };
    required: {
        type: "boolean";
        collection: false;
        defaultValue: () => boolean;
    };
    isCollection: {
        type: "boolean";
        collection: false;
        defaultValue: () => boolean;
    };
    itemRef: {
        collection: false;
        required: false;
        type: (Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }> | Klass<{
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
        }>)[];
    };
}>;

declare interface PrimitivePropertyMap {
    string: string;
    number: number;
    boolean: boolean;
    object: object;
    function: (...arg: any[]) => any;
}

declare type PrimitivePropType = 'string' | 'number' | 'boolean' | 'object' | 'function';

export declare const Property: Klass<{
    name: {
        type: "string";
        required: true;
        collection: false;
        constraints: {
            format({ name }: {
                name: Atom<string>;
            }): Atom<boolean>;
            length({ name }: {
                name: Atom<string>;
            }): Atom<boolean>;
        };
    };
    type: {
        type: "string";
        required: true;
        collection: false;
        options: PropertyTypes[];
    };
    collection: {
        type: "boolean";
        required: true;
        collection: false;
        defaultValue(): boolean;
    };
    args: {
        computedType: (values: {
            type: PropertyTypes;
        }) => string;
    };
    computedData: {
        collection: false;
        type: Klass<any>[];
        required: false;
    };
    computed: {
        required: false;
        type: "function";
        collection: false;
    };
}>;

export declare const PropertyTypeMap: {
    string: string;
    number: string;
    boolean: string;
};

export declare enum PropertyTypes {
    String = "string",
    Number = "number",
    Boolean = "boolean"
}

export declare const Query: Klass<    {
    items: {
        type: Klass<    {
            name: {
                type: "string";
                required: true;
                collection: false;
            };
            value: {
                type: "string";
                required: true;
                collection: false;
            };
        }>[];
        required: true;
        collection: true;
    };
}>;

export declare const QueryItem: Klass<    {
    name: {
        type: "string";
        required: true;
        collection: false;
    };
    value: {
        type: "string";
        required: true;
        collection: false;
    };
}>;

export declare type ReactiveKlassInstance<T extends NonNullable<KlassMeta["public"]>> = ReactiveKlassInstanceProps<T> & KlassInstancePrimitiveProps;

export declare type ReactiveKlassInstanceProps<T extends NonNullable<KlassMeta["public"]>> = OptionalProps<T, true, false> & RequiredProps<T, true, false>;

export declare type ReactiveKlassOptions = Omit<KlassOptions, 'isReactive'> & {
    isReactive: true;
};

export declare type RecordChangeListener = (mutationEvents: RecordMutationEvent[]) => any;

export declare type RecordMutationEvent = {
    recordName: string;
    type: 'create' | 'update' | 'delete';
    keys?: string[];
    record?: {
        [key: string]: any;
    };
    oldRecord?: {
        [key: string]: any;
    };
};

export declare const Relation: Klass<RelationPublic>;

export declare const RelationBasedAny: Klass<{
    relation: {
        type: Klass<RelationPublic>;
        collection: false;
        required: true;
    };
    relationDirection: {
        type: "string";
        collection: false;
        required: true;
        defaultValue: () => string;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare const RelationBasedEvery: Klass<{
    relation: {
        type: Klass<RelationPublic>;
        collection: false;
        required: true;
    };
    relationDirection: {
        type: "string";
        collection: false;
        required: true;
        defaultValue: () => string;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
    notEmpty: {
        type: "boolean";
        collection: false;
        required: false;
    };
}>;

export declare const RelationBasedWeightedSummation: Klass<{
    relations: {
        type: Klass<{
            relation: {
                type: Klass<RelationPublic>;
                collection: false;
                required: true;
            };
            relationDirection: {
                type: "string";
                collection: false;
                required: true;
                defaultValue: () => string;
            };
        }>;
        collection: true;
        required: true;
    };
    matchRelationToWeight: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare const RelationCount: Klass<{
    relation: {
        type: Klass<RelationPublic>;
        collection: false;
        required: true;
    };
    relationDirection: {
        type: "string";
        collection: false;
        required: true;
        defaultValue: () => string;
    };
    matchExpression: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare type RelationPublic = {
    name: {
        type: 'string';
        required: false;
        collection: false;
        computed: (relation: any) => any;
    };
    source: {
        type: typeof Entity | Klass<RelationPublic>;
        required: true;
        collection: false;
        options: () => (KlassInstance<typeof Entity, any> | KlassInstance<Klass<RelationPublic>, any>)[];
    };
    sourceProperty: {
        type: 'string';
        required: true;
        collection: false;
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string;
        };
    };
    target: {
        type: typeof Entity;
        required: true;
        collection: false;
        options: () => (KlassInstance<typeof Entity, any> | KlassInstance<Klass<RelationPublic>, any>)[];
    };
    targetProperty: {
        type: 'string';
        required: true;
        collection: false;
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string;
        };
    };
    isTargetReliance: {
        type: 'boolean';
        required: true;
        collection: false;
        defaultValue: () => boolean;
    };
    relType: {
        type: 'string';
        collection: false;
        required: true;
        options: () => string[];
        defaultValue: () => [string];
    };
    computedData: {
        type: Klass<any>[];
        collection: false;
        required: false;
    };
    properties: {
        type: typeof Property;
        collection: true;
        required: true;
        constraints: {
            [ruleName: string]: ((thisProp: any, thisEntity: object) => Atom<boolean> | boolean | any[]) | Function | string;
        };
        defaultValue: () => any[];
    };
};

export declare const RelationStateMachine: Klass<{
    states: {
        type: Klass<{
            hasRelation: {
                type: "boolean";
                required: true;
                collection: false;
            };
            fixedProperties: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    value: {
                        type: Klass<any>[];
                        collection: false;
                        required: true;
                    };
                }>;
                collection: true;
                required: false;
            };
            propertyHandle: {
                type: "function";
                required: false;
                collection: false;
            };
        }>;
        collection: true;
        required: true;
    };
    transfers: {
        type: Klass<{
            sourceActivity: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    interactions: {
                        type: Klass<InteractionPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<InteractionPublicType> | ReactiveKlassInstance<InteractionPublicType>)[];
                    };
                    transfers: {
                        type: Klass<TransferPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (ReactiveKlassInstance<TransferPublicType> | InertKlassInstance<TransferPublicType>)[];
                    };
                    groups: {
                        type: Klass<ActivityGroupPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<ActivityGroupPublicType> | ReactiveKlassInstance<ActivityGroupPublicType>)[];
                    };
                    gateways: {
                        type: Klass<GatewayPublicType>;
                        collection: true;
                        defaultValue: (...args: any[]) => (InertKlassInstance<GatewayPublicType> | ReactiveKlassInstance<GatewayPublicType>)[];
                    };
                    events: {
                        type: Klass<{
                            name: {
                                type: "string";
                                required: true;
                            };
                        }>;
                        collection: true;
                        defaultValue: (...args: any[]) => (ReactiveKlassInstance<    {
                            name: {
                                type: "string";
                                required: true;
                            };
                        }> | InertKlassInstance<    {
                            name: {
                                type: "string";
                                required: true;
                            };
                        }>)[];
                    };
                }>;
                collection: false;
                required: false;
            };
            triggerInteraction: {
                type: Klass<InteractionPublicType>;
                collection: false;
                required: true;
            };
            fromState: {
                type: Klass<{
                    hasRelation: {
                        type: "boolean";
                        required: true;
                        collection: false;
                    };
                    fixedProperties: {
                        type: Klass<{
                            name: {
                                type: "string";
                                collection: false;
                                required: true;
                            };
                            value: {
                                type: Klass<any>[];
                                collection: false;
                                required: true;
                            };
                        }>;
                        collection: true;
                        required: false;
                    };
                    propertyHandle: {
                        type: "function";
                        required: false;
                        collection: false;
                    };
                }>;
                collection: false;
                required: true;
            };
            toState: {
                type: Klass<{
                    hasRelation: {
                        type: "boolean";
                        required: true;
                        collection: false;
                    };
                    fixedProperties: {
                        type: Klass<{
                            name: {
                                type: "string";
                                collection: false;
                                required: true;
                            };
                            value: {
                                type: Klass<any>[];
                                collection: false;
                                required: true;
                            };
                        }>;
                        collection: true;
                        required: false;
                    };
                    propertyHandle: {
                        type: "function";
                        required: false;
                        collection: false;
                    };
                }>;
                collection: false;
                required: true;
            };
            handleType: {
                type: "string";
            };
            handle: {
                type: "function";
                collection: false;
                required: true;
            };
        }>;
        collection: true;
        required: true;
    };
    defaultState: {
        type: Klass<{
            hasRelation: {
                type: "boolean";
                required: true;
                collection: false;
            };
            fixedProperties: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    value: {
                        type: Klass<any>[];
                        collection: false;
                        required: true;
                    };
                }>;
                collection: true;
                required: false;
            };
            propertyHandle: {
                type: "function";
                required: false;
                collection: false;
            };
        }>;
        collection: false;
        required: true;
    };
}>;

export declare const RelationStateNode: Klass<{
    hasRelation: {
        type: "boolean";
        required: true;
        collection: false;
    };
    fixedProperties: {
        type: Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
            };
            value: {
                type: Klass<any>[];
                collection: false;
                required: true;
            };
        }>;
        collection: true;
        required: false;
    };
    propertyHandle: {
        type: "function";
        required: false;
        collection: false;
    };
}>;

export declare const RelationStateTransfer: Klass<{
    sourceActivity: {
        type: Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
            };
            interactions: {
                type: Klass<InteractionPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<InteractionPublicType> | ReactiveKlassInstance<InteractionPublicType>)[];
            };
            transfers: {
                type: Klass<TransferPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (ReactiveKlassInstance<TransferPublicType> | InertKlassInstance<TransferPublicType>)[];
            };
            groups: {
                type: Klass<ActivityGroupPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<ActivityGroupPublicType> | ReactiveKlassInstance<ActivityGroupPublicType>)[];
            };
            gateways: {
                type: Klass<GatewayPublicType>;
                collection: true;
                defaultValue: (...args: any[]) => (InertKlassInstance<GatewayPublicType> | ReactiveKlassInstance<GatewayPublicType>)[];
            };
            events: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                    };
                }>;
                collection: true;
                defaultValue: (...args: any[]) => (ReactiveKlassInstance<    {
                    name: {
                        type: "string";
                        required: true;
                    };
                }> | InertKlassInstance<    {
                    name: {
                        type: "string";
                        required: true;
                    };
                }>)[];
            };
        }>;
        collection: false;
        required: false;
    };
    triggerInteraction: {
        type: Klass<InteractionPublicType>;
        collection: false;
        required: true;
    };
    fromState: {
        type: Klass<{
            hasRelation: {
                type: "boolean";
                required: true;
                collection: false;
            };
            fixedProperties: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    value: {
                        type: Klass<any>[];
                        collection: false;
                        required: true;
                    };
                }>;
                collection: true;
                required: false;
            };
            propertyHandle: {
                type: "function";
                required: false;
                collection: false;
            };
        }>;
        collection: false;
        required: true;
    };
    toState: {
        type: Klass<{
            hasRelation: {
                type: "boolean";
                required: true;
                collection: false;
            };
            fixedProperties: {
                type: Klass<{
                    name: {
                        type: "string";
                        collection: false;
                        required: true;
                    };
                    value: {
                        type: Klass<any>[];
                        collection: false;
                        required: true;
                    };
                }>;
                collection: true;
                required: false;
            };
            propertyHandle: {
                type: "function";
                required: false;
                collection: false;
            };
        }>;
        collection: false;
        required: true;
    };
    handleType: {
        type: "string";
    };
    handle: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export declare function removeAllInstance(): void;

export declare type RequiredProps<T extends NonNullable<KlassMeta["public"]>, REACTIVE extends true | false, IS_ARG extends true | false> = OmitNever<{
    [Key in keyof T]: RequireWithoutDefaultAndComputed<T[Key], IS_ARG> extends true ? (T[Key]["instanceType"] extends Object ? KlassProp<REACTIVE, T[Key]["collection"], T[Key]["instanceType"]> : (T[Key]['type'] extends Klass<any> ? KlassProp<REACTIVE, T[Key]["collection"], InertKlassInstance<T[Key]['type']['public']>> : T[Key]['type'] extends Klass<any>[] ? ExtractKlassTypes<REACTIVE, T[Key]["collection"], T[Key]['type']> : T[Key]['type'] extends PrimitivePropType ? KlassProp<REACTIVE, T[Key]["collection"], PrimitivePropertyMap[T[Key]['type']]> : never)) : never;
}>;

export declare type RequireWithoutDefaultAndComputed<T extends ClassMetaPublicItem, IS_ARG extends true | false> = IS_ARG extends true ? (T["defaultValue"] extends DefaultValueType ? false : T["computed"] extends ComputedValueType ? false : T["required"] extends true ? true : false) : (T["defaultValue"] extends DefaultValueType ? true : T["computed"] extends ComputedValueType ? true : T["required"] extends true ? true : false);

export declare const ROW_ID_ATTR = "_rowId";

declare type Seq = {
    head: InteractionNode | ActivityGroupNode;
    tail: InteractionNode | ActivityGroupNode;
};

declare type ServerOptions = {
    port: number;
    parseUserId: (headers: any) => Promise<string | undefined>;
    cors?: Parameters<typeof cors>[0];
    logger?: FastifyLoggerOptions;
};

export declare const SideEffect: Klass<{
    name: {
        type: "string";
        required: true;
        collection: false;
    };
    handle: {
        type: "function";
        required: true;
        collection: false;
    };
}>;

declare type SideEffectResult = {
    result: any;
    error: any;
};

export declare class SQLiteDB implements Database {
    file: string;
    options?: (SQLite.Options & {
        logger: DatabaseLogger;
    }) | undefined;
    db: InstanceType<typeof SQLite>;
    idSystem: IDSystem;
    logger: DatabaseLogger;
    constructor(file?: string, options?: (SQLite.Options & {
        logger: DatabaseLogger;
    }) | undefined);
    open(): Promise<void>;
    query<T extends any>(sql: string, where?: any[], name?: string): Promise<T[]>;
    update(sql: string, values: any[], idField?: string, name?: string): Promise<any[]>;
    insert(sql: string, values: any[], name?: string): Promise<EntityIdRef>;
    delete(sql: string, where: any[], name?: string): Promise<any[]>;
    scheme(sql: string, name?: string): Promise<SQLite.RunResult>;
    close(): void;
    getAutoId(recordName: string): Promise<string>;
}

export declare type SQLiteDBOptions = Parameters<typeof SQLite>[1] & {
    logger: DatabaseLogger;
};

export declare function startServer(controller: Controller, options: ServerOptions, dataAPIs?: DataAPIs): Promise<void>;

export declare const State: Klass<{
    name: {
        type: "string";
        required: true;
        collection: false;
        constraints: {
            format({ name }: {
                name: Atom<string>;
            }): Atom<boolean>;
            length({ name }: {
                name: Atom<string>;
            }): Atom<boolean>;
        };
    };
    type: {
        type: "string";
        required: true;
        collection: false;
        options: PropertyTypes[];
    };
    collection: {
        type: "boolean";
        required: true;
        collection: false;
        defaultValue(): boolean;
    };
    args: {
        computedType: (values: {
            type: PropertyTypes;
        }) => string;
    };
    computedData: {
        collection: false;
        type: Klass<any>[];
        required: false;
    };
}>;

declare type Storage_2 = {
    map: any;
    beginTransaction: (transactionName?: string) => Promise<any>;
    commitTransaction: (transactionName?: string) => Promise<any>;
    rollbackTransaction: (transactionName?: string) => Promise<any>;
    get: (itemName: string, id: string, initialValue?: any) => Promise<any>;
    set: (itemName: string, id: string, value: any) => Promise<any>;
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], createTables?: boolean) => any;
    findOne: (entityName: string, ...arg: any[]) => Promise<any>;
    update: (entityName: string, ...arg: any[]) => Promise<any>;
    find: (entityName: string, ...arg: any[]) => Promise<any[]>;
    create: (entityName: string, data: any) => Promise<any>;
    delete: (entityName: string, data: any) => Promise<any>;
    findOneRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    findRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    updateRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    removeRelationByName: (relationName: string, ...arg: any[]) => Promise<any>;
    addRelationByNameById: (relationName: string, ...arg: any[]) => Promise<any>;
    getRelationName: (...arg: any[]) => string;
    listen: (callback: RecordChangeListener) => any;
};
export { Storage_2 as Storage }

export declare function stringifyAllInstances(): string;

export declare function stringifyAttribute(obj: any): any;

export declare function stringifyInstance(obj: InertKlassInstance<any>): string;

export declare interface System {
    getEvent: (query: any) => Promise<InteractionEvent[]>;
    saveEvent: (interactionEvent: InteractionEvent) => Promise<any>;
    createActivity: (activity: any) => Promise<any>;
    updateActivity: (match: MatchExpressionData, activity: any) => Promise<any>;
    getActivity: (query?: MatchExpressionData) => Promise<any[]>;
    conceptClass: Map<string, ReturnType<typeof createClass>>;
    storage: Storage_2;
    logger: SystemLogger;
    setup: (entities: KlassInstance<typeof Entity, false>[], relations: KlassInstance<typeof Relation, false>[], install?: boolean) => Promise<any>;
}

export declare const SYSTEM_RECORD = "_System_";

export declare type SystemCallback = (...arg: any[]) => any;

export declare const systemEntity: InertKlassInstance<    {
name: {
type: "string";
collection: false;
required: true;
constraints: {
nameFormat({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
computedData: {
type: Klass<any>[];
collection: false;
required: false;
};
properties: {
type: Klass<    {
name: {
type: "string";
required: true;
collection: false;
constraints: {
format({ name }: {
name: Atom<string>;
}): Atom<boolean>;
length({ name }: {
name: Atom<string>;
}): Atom<boolean>;
};
};
type: {
type: "string";
required: true;
collection: false;
options: PropertyTypes[];
};
collection: {
type: "boolean";
required: true;
collection: false;
defaultValue(): boolean;
};
args: {
computedType: (values: {
type: PropertyTypes;
}) => string;
};
computedData: {
collection: false;
type: Klass<any>[];
required: false;
};
computed: {
required: false;
type: "function";
collection: false;
};
}>;
collection: true;
required: true;
constraints: {
eachNameUnique({ properties }: any): Atom<boolean>;
};
defaultValue(): never[];
};
isRef: {
required: true;
collection: false;
type: "boolean";
defaultValue: () => boolean;
};
}>;

export declare type SystemLogger = {
    error: (arg: SystemLogType) => any;
    info: (arg: SystemLogType) => any;
    debug: (arg: SystemLogType) => any;
    child: (fixed: object) => SystemLogger;
};

export declare type SystemLogType = {
    label: string;
    message: string;
    [k: string]: any;
};

export declare const Transfer: Klass<TransferPublicType>;

export declare type TransferInstanceType = KlassInstance<typeof Transfer, false>;

export declare type TransferPublicType = {
    name: {
        type: 'string';
        required: true;
        collection: false;
    };
    source: {
        type: (Klass<InteractionPublicType> | Klass<ActivityGroupPublicType> | Klass<GatewayPublicType>)[];
        required: true;
        collection: false;
    };
    target: {
        type: (Klass<InteractionPublicType> | Klass<ActivityGroupPublicType> | Klass<GatewayPublicType>)[];
        required: true;
        collection: false;
    };
};

export declare type UnwrapCollectionType<T extends Klass<any>[]> = {
    [Key in keyof T]: T[Key]["public"];
}[keyof T][number];

declare type UnwrappedActivityInstanceType = {
    name: string;
    interactions: KlassInstance<Klass<InteractionPublicType>, any>[];
    transfers: KlassInstance<Klass<TransferPublicType>, any>[];
    groups: KlassInstance<Klass<ActivityGroupPublicType>, any>[];
    gateways: KlassInstance<Klass<GatewayPublicType>, any>[];
    events: KlassInstance<typeof Event_2, any>[];
} & KlassInstancePrimitiveProps;

export declare type UnwrappedBoolExpressionInstanceType<T extends NonNullable<KlassMeta["public"]>> = {
    type: string;
    operator: string;
    left: UnwrappedBoolExpressionInstanceType<T> | KlassInstance<typeof BoolAtomData, false>;
    right?: UnwrappedBoolExpressionInstanceType<T> | KlassInstance<typeof BoolAtomData, false>;
} & KlassInstancePrimitiveProps;

export declare const USER_ENTITY = "User";

export declare const WeightedSummation: Klass<{
    records: {
        type: (Klass<{
            name: {
                type: "string";
                collection: false;
                required: true;
                constraints: {
                    nameFormat({ name }: {
                        name: Atom<string>;
                    }): Atom<boolean>;
                };
            };
            computedData: {
                type: Klass<any>[];
                collection: false;
                required: false;
            };
            properties: {
                type: Klass<{
                    name: {
                        type: "string";
                        required: true;
                        collection: false;
                        constraints: {
                            format({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                            length({ name }: {
                                name: Atom<string>;
                            }): Atom<boolean>;
                        };
                    };
                    type: {
                        type: "string";
                        required: true;
                        collection: false;
                        options: PropertyTypes[];
                    };
                    collection: {
                        type: "boolean";
                        required: true;
                        collection: false;
                        defaultValue(): boolean;
                    };
                    args: {
                        computedType: (values: {
                            type: PropertyTypes;
                        }) => string;
                    };
                    computedData: {
                        collection: false;
                        type: Klass<any>[];
                        required: false;
                    };
                    computed: {
                        required: false;
                        type: "function";
                        collection: false;
                    };
                }>;
                collection: true;
                required: true;
                constraints: {
                    eachNameUnique({ properties }: any): Atom<boolean>;
                };
                defaultValue(): never[];
            };
            isRef: {
                required: true;
                collection: false;
                type: "boolean";
                defaultValue: () => boolean;
            };
        }> | Klass<RelationPublic>)[];
        collection: true;
        required: true;
    };
    matchRecordToWeight: {
        type: "function";
        collection: false;
        required: true;
    };
}>;

export { }
