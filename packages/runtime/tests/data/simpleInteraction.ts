export const data = [{
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "d70bc945-11cf-4a6e-8bc6-6e18b75e15f1",
    "public": {"name": "Message", "isRef": false}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "f31a03cd-28b4-42f0-b00a-7bbe335fcc97",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('user')}",
        "name": "user",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "f4b45b5b-d5f9-4626-98d0-8059474893b2",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('A')}",
        "name": "A",
        "isRef": true,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "3814923d-88a1-440b-85d0-3ed31e00b231",
    "public": {"stringContent": "function New(){}", "name": "New", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "e9c1dd7d-7016-439d-8f32-075ad113c4dc",
    "public": {"stringContent": "function New2(){}", "name": "New2", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "3c36716a-fa4c-417a-bf2d-dd0192aa1441",
    "public": {"stringContent": "function New3(){}", "name": "New3", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "5e93294b-e050-4f7b-b1b9-cd437c923851",
    "public": {"stringContent": "function Old(){}", "name": "Old", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "b0de325e-da15-48c3-86e1-8c5dd6f6edbf",
    "public": {"stringContent": "function Old2(){}", "name": "Old2", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "6a21e1b1-993e-4e2c-8f13-06b2d6371ce9",
    "public": {"stringContent": "function Old3(){}", "name": "Old3", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "fd629032-a16c-495a-a941-1d33058bd4d8",
    "public": {"stringContent": "function Other(){}", "name": "Other", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "80c4208f-9587-48cf-80dd-5eb291820957",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('User')}",
        "name": "User",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "15179bac-1933-4c9f-b330-0372013f1e92",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('Admin')}",
        "name": "Admin",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "4bbc3bb0-03cf-45f6-933c-a512b1a210fb",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('Anonymous')}",
        "name": "Anonymous",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "13d902d1-bec6-4fdf-be1b-0b710038ab39",
    "public": {"stringContent": null, "name": "B", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributives",
    "options": {"isReactive": true},
    "uuid": "e9a58b35-1ec1-4068-ab06-59ef1e5e9cea",
    "public": {
        "content": {
            "type": "group",
            "op": "&&",
            "left": {"type": "variable", "name": "New", "uuid": "3814923d-88a1-440b-85d0-3ed31e00b231"},
            "right": {"type": "variable", "name": "Other", "uuid": "fd629032-a16c-495a-a941-1d33058bd4d8"}
        }
    }
}, {
    "type": "UserAttributives",
    "options": {"isReactive": true},
    "uuid": "1a651472-f9e1-4eb4-9814-3e8af784e9a7",
    "public": {"content": {"type": "variable", "name": "Other", "uuid": "fd629032-a16c-495a-a941-1d33058bd4d8"}}
}, {
    "type": "EntityAttributive",
    "options": {"isReactive": true},
    "uuid": "7c0a8396-3fcb-49ec-88b0-e675d642151c",
    "public": {"name": null, "content": null, "stringContent": null}
}, {
    "type": "EntityAttributives",
    "options": {"isReactive": true},
    "uuid": "1e1956d9-477d-4e0e-8ca2-0072841f438f",
    "public": {"content": null}
}, {"type": "Action", "uuid": "4a8b9754-cba5-4e86-bfd8-46db570808e2", "public": {"name": "get"}}, {
    "type": "Action",
    "options": {"isReactive": true},
    "uuid": "8a9a2ecb-fc02-4077-8bb5-64edef043698",
    "public": {"name": "sendRequest"}
}, {
    "type": "PayloadItem",
    "options": {"isReactive": true},
    "uuid": "21bf8cb6-3f0d-46d1-8cb1-b26a300f60be",
    "public": {
        "name": "to",
        "attributives": "1a651472-f9e1-4eb4-9814-3e8af784e9a7",
        "base": "15179bac-1933-4c9f-b330-0372013f1e92",
        "isRef": true,
        "isCollection": false,
        "itemRef": "13d902d1-bec6-4fdf-be1b-0b710038ab39"
    }
}, {
    "type": "PayloadItem",
    "options": {"isReactive": true},
    "uuid": "d02b81ac-8032-40a2-96dc-7456595f0bb9",
    "public": {
        "name": "message",
        "attributives": "1e1956d9-477d-4e0e-8ca2-0072841f438f",
        "base": "d70bc945-11cf-4a6e-8bc6-6e18b75e15f1",
        "isRef": false,
        "isCollection": false,
        "itemRef": "7c0a8396-3fcb-49ec-88b0-e675d642151c"
    }
}, {
    "type": "Payload",
    "options": {"isReactive": true},
    "uuid": "1d9674f0-5f66-41af-ad9a-2622eb47d902",
    "public": {}
}, {
    "type": "Interaction",
    "options": {"isReactive": true},
    "uuid": "98ced692-1c31-473a-a07f-41664b981e7c",
    "public": {
        "name": "sendRequest",
        "userAttributives": "e9a58b35-1ec1-4068-ab06-59ef1e5e9cea",
        "userRoleAttributive": "15179bac-1933-4c9f-b330-0372013f1e92",
        "userRef": "f4b45b5b-d5f9-4626-98d0-8059474893b2",
        "action": "8a9a2ecb-fc02-4077-8bb5-64edef043698",
        "payload": "1d9674f0-5f66-41af-ad9a-2622eb47d902"
    }
}]