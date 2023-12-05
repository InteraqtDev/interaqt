export const data = [{
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "5af19aa0-9388-4639-bdc9-bae9783363c7",
    "public": {"name": "name", "type": "string", "collection": false, "args": null}
}, {
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "9919161b-621b-443b-97ea-a69b511b3a90",
    "public": {"name": "age", "type": "number", "collection": false, "args": null}
}, {
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "f3d794ba-7771-4086-8339-fd3c3fcd8286",
    "public": {"name": "title", "type": "string", "collection": false, "args": null}
}, {
    "type": "Property",
    "options": {"isReactive": true},
    "uuid": "67452fcf-f912-4988-9e1b-07fd2f6f3d36",
    "public": {"name": "itemName", "type": "string", "collection": false, "args": null}
}, {
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "ffd55e47-7fed-4979-8756-f5499b02fb86",
    "public": {
        "name": "User",
        "computedData": null,
        "properties": ["5af19aa0-9388-4639-bdc9-bae9783363c7", "9919161b-621b-443b-97ea-a69b511b3a90"],
        "isRef": false
    }
}, {
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "49226bbc-ec6a-4541-9020-633f26612588",
    "public": {
        "name": "Profile",
        "computedData": null,
        "properties": ["f3d794ba-7771-4086-8339-fd3c3fcd8286"],
        "isRef": false
    }
}, {
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "bf2fe51d-c938-452d-a4f9-fed37c00a784",
    "public": {
        "name": "Item",
        "computedData": null,
        "properties": ["67452fcf-f912-4988-9e1b-07fd2f6f3d36"],
        "isRef": false
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "d801cce2-0c65-4d30-ad96-640808573162",
    "public": {
        "source": "49226bbc-ec6a-4541-9020-633f26612588",
        "sourceAttribute": "owner",
        "target": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "targetAttribute": "profile",
        "relType": "1:1",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "e9b4b736-5d64-4619-9495-f58e173a11d3",
    "public": {
        "source": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "sourceAttribute": "leader",
        "target": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "targetAttribute": "member",
        "relType": "n:1",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "f49cc3a7-c6dc-4d2b-99d7-f6b5a3d38edd",
    "public": {
        "source": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "sourceAttribute": "friends",
        "target": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "targetAttribute": "friends",
        "relType": "n:n",
        "properties": []
    }
}, {
    "type": "Relation",
    "options": {"isReactive": true},
    "uuid": "6190a0f8-631e-417f-ac59-a7eda492d903",
    "public": {
        "source": "ffd55e47-7fed-4979-8756-f5499b02fb86",
        "sourceAttribute": "item",
        "target": "bf2fe51d-c938-452d-a4f9-fed37c00a784",
        "targetAttribute": "owner",
        "relType": "1:1",
        "properties": []
    }
}]