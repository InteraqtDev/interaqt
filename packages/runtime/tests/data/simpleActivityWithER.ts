// 交友相关的 User/Request friendRelation 例子

export const data = [
{
    "type": "MapActivityToEntity",
    "options": {"isReactive": true},
    "uuid": "a552045f-50bc-4b55-bc0d-71baca3a3bee",
    "public": {
        "sourceActivity": "42913934-59dd-43a6-9420-68f07fc38cbd",
        "triggerInteraction": ["72af2454-c3a9-45f2-b981-71f0be193514", "deef98f0-7d00-41fd-a5e4-ffad5314f3ef", "9b7baac9-54f7-47a8-8a4d-48cfb781d500"],
        "handle": `function map(stack){
        const sendRequestEvent = stack.find(i => i.interaction.name === 'sendRequest')
        
if (!sendRequestEvent) { 
    return undefined
}

const handled = !!stack.find(i => i.interaction.name === 'approve' || i.interaction.name === 'reject')
        
return {
    from: sendRequestEvent.data.user,
    to: sendRequestEvent.data.payload.to,
    message: sendRequestEvent.data.payload.message,
    handled,
}
}`}
    },{
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "39ad7213-d281-464a-9b3e-bbfe8e66b046",
    "public": {"name": "name", "type": "string", "collection": false, "args": null}
}, {
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "bc167fab-35ce-496c-aa6f-d1212ee12d99",
    "public": {"name": "age", "type": "number", "collection": false, "args": null}
}, {
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "5fc03461-076a-4195-8bb3-d276f3013cf4",
    "public": {
        "name": "User",
        "computedData": null,
        "properties": ["39ad7213-d281-464a-9b3e-bbfe8e66b046", "bc167fab-35ce-496c-aa6f-d1212ee12d99"],
        "isRef": false
    }
}, {
        "type": "Property",
        "options": {"isReactive": true},
        "uuid": "4dac9222-f1a5-40c6-bfca-f66e94447d05",
        "public": {"name": "handled", "type": "boolean", "collection": false, "args": null}
},{
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "42913934-59dd-43a6-9420-68f07fc38cbd",
    "public": {
        "name": "Request",
        "computedData": "a552045f-50bc-4b55-bc0d-71baca3a3bee",
        "properties": ["4dac9222-f1a5-40c6-bfca-f66e94447d05"],
        "isRef": false
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "1126e507-a15c-4ab0-ab72-5f1858fb1f02",
    "public": {
        "entity1": "5fc03461-076a-4195-8bb3-d276f3013cf4",
        "targetName1": "friends",
        "entity2": "5fc03461-076a-4195-8bb3-d276f3013cf4",
        "targetName2": "friends",
        "relType": "n:n",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "3ade5885-e655-4e89-b736-fdc70b1b74d8",
    "public": {
        "entity1": "42913934-59dd-43a6-9420-68f07fc38cbd",
        "targetName1": "from",
        "entity2": "5fc03461-076a-4195-8bb3-d276f3013cf4",
        "targetName2": "request",
        "relType": "n:1",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "a1a2e562-a378-431d-9b37-714fcd2f7bad",
    "public": {
        "entity1": "42913934-59dd-43a6-9420-68f07fc38cbd",
        "targetName1": "to",
        "entity2": "5fc03461-076a-4195-8bb3-d276f3013cf4",
        "targetName2": "receivedRequest",
        "relType": "n:1",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "d59c8f7e-1d46-4720-b8ea-28529c5c7827",
    "public": {
        "entity1": "42913934-59dd-43a6-9420-68f07fc38cbd",
        "targetName1": "message",
        "entity2": "d29be9d4-3d07-4fa1-a887-e60655a281e3",
        "targetName2": "request",
        "relType": "1:1",
        "properties": []
    }
},
    {"type": "Action", "uuid": "6d0ef9c4-59eb-4b96-9080-404beeada162", "public": {"name": "get"}},

    // 下面是 activity data
    {
        "type": "Entity",
        "options": {"isReactive": true},
        "uuid": "d29be9d4-3d07-4fa1-a887-e60655a281e3",
        "public": {
            "name": "Message",
            "properties": [{"name": "content", "type": "string", "collection": false}],
            "isRef": false
        }
    }, {
        "type": "Entity",
        "options": {"isReactive": true},
        "uuid": "0c7f4861-1c79-4f34-b191-79b036dbffe1",
        "public": {"name": "", "properties": [], "isRef": true}
    }, {
        "type": "Entity",
        "options": {"isReactive": true},
        "uuid": "f239b2f3-30d6-42cc-bc52-19d5124a9762",
        "public": {"name": "", "properties": [], "isRef": true}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "3b779ba8-6b15-4c49-9283-b46f91d56ce3",
        "public": {"content": "function New(){}", "name": "New", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "7ff11a85-2147-4919-b24b-6c676a818f05",
        "public": {"content": "function New2(){}", "name": "New2", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "5a369d19-fd73-4c9a-b81d-77c70129cd8a",
        "public": {"content": "function New3(){}", "name": "New3", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "a99e36e0-6b69-4cc6-bc04-905e7e6634af",
        "public": {"content": "function Old(){}", "name": "Old", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "521f2703-114c-477c-88b3-82bfaa81757e",
        "public": {"content": "function Old2(){}", "name": "Old2", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "ded1c9db-db6a-4443-94c8-d439612bebda",
        "public": {"content": "function Old3(){}", "name": "Old3", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "9f5324d1-d97b-4b70-8036-d8685f56b4e3",
        "public": {"content": "function Other(){}", "name": "Other", "isRef": null, "isRole": null}
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "205b488e-c2db-4bb1-be8e-b155aab9f94c",
        "public": {
            "content": "function({ user }) { return user.roles.includes('User')}",
            "name": "User",
            "isRef": false,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "aed5100d-971a-4d2b-9b60-24057f514348",
        "public": {
            "content": "function({ user }) { return user.roles.includes('Admin')}",
            "name": "Admin",
            "isRef": false,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "b2ad1cbd-5024-4b2f-8af3-4dd8010c4438",
        "public": {
            "content": "function({ user }) { return user.roles.includes('Anonymous')}",
            "name": "Anonymous",
            "isRef": false,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "55cda086-23a9-4fb8-89d1-8e9292c8baeb",
        "public": {
            "content": "function({ user }) { return user.roles.includes('user')}",
            "name": "user",
            "isRef": false,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "a2755426-ed1b-45d3-adea-4a41611686df",
        "public": {
            "content": "function({ user }) { return user.roles.includes('A')}",
            "name": "A",
            "isRef": true,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "efbac6ee-1edc-4576-a812-30c4d24fa89d",
        "public": {
            "content": "function({ user }) { return user.roles.includes('B')}",
            "name": "B",
            "isRef": true,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "257fbd84-31e8-4d28-a31a-6097dd785b6b",
        "public": {
            "content": "function({ user }) { return user.roles.includes('')}",
            "name": "",
            "isRef": true,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "3a4b4278-a4c7-403f-9555-28d2514c8bf5",
        "public": {
            "content": "function({ user }) { return user.roles.includes('')}",
            "name": "",
            "isRef": true,
            "isRole": true
        }
    }, {
        "type": "UserAttributive",
        "options": {"isReactive": true},
        "uuid": "919284f8-37a9-4c54-8005-f42bfd5c54e1",
        "public": {
            "content": "function({ user }) { return user.roles.includes('')}",
            "name": "",
            "isRef": true,
            "isRole": true
        }
    }, {
        "type": "UserAttributives",
        "options": {"isReactive": true},
        "uuid": "fa0b7fe1-4c50-4e0a-8655-4cef54a12ec3",
        "public": {"content": null}
    }, {
        "type": "UserAttributives",
        "options": {"isReactive": true},
        "uuid": "337724f6-ea88-4484-a27a-de8e8c906c87",
        "public": {"content": null}
    }, {
        "type": "UserAttributives",
        "options": {"isReactive": true},
        "uuid": "31ceb494-4f4f-4d0f-bb03-7b8ed61f8fc6",
        "public": {"content": null}
    }, {
        "type": "UserAttributives",
        "options": {"isReactive": true},
        "uuid": "d4d2fc05-f1a6-4aea-b6d8-fffd2c099fc3",
        "public": {"content": null}
    }, {
        "type": "UserAttributives",
        "options": {"isReactive": true},
        "uuid": "0d0d6170-6fbf-42dd-b98b-a043a362720c",
        "public": {"content": null}
    }, {
        "type": "EntityAttributives",
        "options": {"isReactive": true},
        "uuid": "806bf86e-8e7b-4eaa-bda4-c41944c5fe80",
        "public": {"content": null}
    }, {
        "type": "EntityAttributives",
        "options": {"isReactive": true},
        "uuid": "471b3bab-55f2-463b-a626-594e1adbd07e",
        "public": {"content": null}
    }, {"type": "Action", "uuid": "0e1bf982-7e08-49d0-9d15-bd0c2b131ff2", "public": {"name": "get"}}, {
        "type": "Action",
        "options": {"isReactive": true},
        "uuid": "0160b961-c6e7-4960-a683-150bc3464491",
        "public": {"name": "sendRequest"}
    }, {
        "type": "Action",
        "options": {"isReactive": true},
        "uuid": "7e14eb9f-8dac-4016-b487-68e6d911c358",
        "public": {"name": "approve"}
    }, {
        "type": "Action",
        "options": {"isReactive": true},
        "uuid": "245905c2-2029-4eff-834e-82a23b2afe65",
        "public": {"name": "reject"}
    }, {
        "type": "Action",
        "options": {"isReactive": true},
        "uuid": "a81819d2-6d35-4dd4-8192-e2b8c5ca8d5d",
        "public": {"name": "cancel"}
    }, {
        "type": "PayloadItem",
        "options": {"isReactive": true},
        "uuid": "6f8091ae-911e-48e0-aa7b-9226e313f05f",
        "public": {
            "name": "to",
            "attributives": "0d0d6170-6fbf-42dd-b98b-a043a362720c",
            "base": "55cda086-23a9-4fb8-89d1-8e9292c8baeb",
            "isRef": true,
            "required": false,
            "isCollection": false,
            "itemRef": "efbac6ee-1edc-4576-a812-30c4d24fa89d"
        }
    }, {
        "type": "PayloadItem",
        "options": {"isReactive": true},
        "uuid": "e1a5077e-15c4-4fbd-acc9-93e41be91663",
        "public": {
            "name": "message",
            "attributives": "806bf86e-8e7b-4eaa-bda4-c41944c5fe80",
            "base": "d29be9d4-3d07-4fa1-a887-e60655a281e3",
            "isRef": false,
            "required": false,
            "isCollection": false,
            "itemRef": "0c7f4861-1c79-4f34-b191-79b036dbffe1"
        }
    }, {
        "type": "PayloadItem",
        "options": {"isReactive": true},
        "uuid": "d4fdac16-b460-48e2-8677-b6e86d27855d",
        "public": {
            "name": "reason",
            "attributives": "471b3bab-55f2-463b-a626-594e1adbd07e",
            "base": "d29be9d4-3d07-4fa1-a887-e60655a281e3",
            "isRef": false,
            "required": false,
            "isCollection": false,
            "itemRef": "f239b2f3-30d6-42cc-bc52-19d5124a9762"
        }
    }, {
        "type": "Payload",
        "options": {"isReactive": true},
        "uuid": "3cb5190a-5cd5-4cc2-9355-7e41691cc7f4",
        "public": {"items": ["6f8091ae-911e-48e0-aa7b-9226e313f05f", "e1a5077e-15c4-4fbd-acc9-93e41be91663"]}
    }, {
        "type": "Payload",
        "options": {"isReactive": true},
        "uuid": "529ea5e3-64e1-4d23-8fcd-6d4836c8d1d8",
        "public": {"items": []}
    }, {
        "type": "Payload",
        "options": {"isReactive": true},
        "uuid": "9d52158c-04c9-4c95-9268-af761468edee",
        "public": {"items": ["d4fdac16-b460-48e2-8677-b6e86d27855d"]}
    }, {
        "type": "Payload",
        "options": {"isReactive": true},
        "uuid": "aec17889-6927-4274-a667-544aaeabfa3e",
        "public": {"items": []}
    }, {
        "type": "Interaction",
        "options": {"isReactive": true},
        "uuid": "72af2454-c3a9-45f2-b981-71f0be193514",
        "public": {
            "name": "sendRequest",
            "userAttributives": "fa0b7fe1-4c50-4e0a-8655-4cef54a12ec3",
            "userRoleAttributive": "55cda086-23a9-4fb8-89d1-8e9292c8baeb",
            "userRef": "a2755426-ed1b-45d3-adea-4a41611686df",
            "action": "0160b961-c6e7-4960-a683-150bc3464491",
            "payload": "3cb5190a-5cd5-4cc2-9355-7e41691cc7f4"
        }
    }, {
        "type": "Interaction",
        "options": {"isReactive": true},
        "uuid": "deef98f0-7d00-41fd-a5e4-ffad5314f3ef",
        "public": {
            "name": "approve",
            "userAttributives": "337724f6-ea88-4484-a27a-de8e8c906c87",
            "userRoleAttributive": "efbac6ee-1edc-4576-a812-30c4d24fa89d",
            "userRef": "257fbd84-31e8-4d28-a31a-6097dd785b6b",
            "action": "7e14eb9f-8dac-4016-b487-68e6d911c358",
            "payload": "529ea5e3-64e1-4d23-8fcd-6d4836c8d1d8"
        }
    }, {
        "type": "Interaction",
        "options": {"isReactive": true},
        "uuid": "9b7baac9-54f7-47a8-8a4d-48cfb781d500",
        "public": {
            "name": "reject",
            "userAttributives": "31ceb494-4f4f-4d0f-bb03-7b8ed61f8fc6",
            "userRoleAttributive": "efbac6ee-1edc-4576-a812-30c4d24fa89d",
            "userRef": "3a4b4278-a4c7-403f-9555-28d2514c8bf5",
            "action": "245905c2-2029-4eff-834e-82a23b2afe65",
            "payload": "9d52158c-04c9-4c95-9268-af761468edee"
        }
    }, {
        "type": "Interaction",
        "options": {"isReactive": true},
        "uuid": "7dc11054-fff4-4d3a-9ee5-e4e9c5e89f0d",
        "public": {
            "name": "cancel",
            "userAttributives": "d4d2fc05-f1a6-4aea-b6d8-fffd2c099fc3",
            "userRoleAttributive": "a2755426-ed1b-45d3-adea-4a41611686df",
            "userRef": "919284f8-37a9-4c54-8005-f42bfd5c54e1",
            "action": "a81819d2-6d35-4dd4-8192-e2b8c5ca8d5d",
            "payload": "aec17889-6927-4274-a667-544aaeabfa3e"
        }
    }, {
        "type": "Activity",
        "options": {"isReactive": true},
        "uuid": "678bbb60-b190-418d-8a07-4d5959aca2b7",
        "public": {
            "name": null,
            "interactions": ["deef98f0-7d00-41fd-a5e4-ffad5314f3ef"],
            "gateways": [],
            "transfers": [],
            "groups": [],
            "events": [],
            "sideEffects": []
        }
    }, {
        "type": "Activity",
        "options": {"isReactive": true},
        "uuid": "c1a6d089-db6e-4d4e-9170-8bee2f1a5968",
        "public": {
            "name": null,
            "interactions": ["9b7baac9-54f7-47a8-8a4d-48cfb781d500"],
            "gateways": [],
            "transfers": [],
            "groups": [],
            "events": [],
            "sideEffects": []
        }
    }, {
        "type": "Activity",
        "options": {"isReactive": true},
        "uuid": "77691e9c-d428-404c-a7d4-833c66504465",
        "public": {
            "name": null,
            "interactions": ["7dc11054-fff4-4d3a-9ee5-e4e9c5e89f0d"],
            "gateways": [],
            "transfers": [],
            "groups": [],
            "events": [],
            "sideEffects": []
        }
    }, {
        "type": "Activity",
        "options": {"isReactive": true},
        "uuid": "764ebdcd-c0cc-4c3d-9ed8-6acc8e57b9ff",
        "public": {
            "name": "createFriendRelation",
            "interactions": ["72af2454-c3a9-45f2-b981-71f0be193514"],
            "gateways": [],
            "transfers": ["92c56dd1-bf30-46aa-8e82-a4a1123e24a3"],
            "groups": ["43e9655d-ab37-4dc2-91c6-58e3fa849128"],
            "events": [],
            "sideEffects": []
        }
    }, {
        "type": "ActivityGroup",
        "options": {"isReactive": true},
        "uuid": "43e9655d-ab37-4dc2-91c6-58e3fa849128",
        "public": {
            "type": "any",
            "activities": ["678bbb60-b190-418d-8a07-4d5959aca2b7", "c1a6d089-db6e-4d4e-9170-8bee2f1a5968", "77691e9c-d428-404c-a7d4-833c66504465"]
        }
    }, {
        "type": "Transfer",
        "options": {"isReactive": true},
        "uuid": "92c56dd1-bf30-46aa-8e82-a4a1123e24a3",
        "public": {
            "name": "fromSendToResponse",
            "source": "72af2454-c3a9-45f2-b981-71f0be193514",
            "target": "43e9655d-ab37-4dc2-91c6-58e3fa849128"
        }
    }

]


