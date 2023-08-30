export const data = [{
    "type": "Entity",
    "options": {"isReactive": true},
    "uuid": "58e150f2-3aa4-41fa-8244-77a469912c43",
    "public": {"name": "Message", "isRef": false}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "4f4a3cb9-c1b8-4719-875f-0541cc801656",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('user')}",
        "name": "user",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "90ea53a5-953a-4e35-b248-395cd5d80623",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('A')}",
        "name": "A",
        "isRef": true,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "22e84f84-4a9e-4fd0-b84c-4a165f10675a",
    "public": {"stringContent": "function New(){}", "name": "New", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "37d9b93a-dd61-4a61-8377-6a9553ff3e74",
    "public": {"stringContent": "function New2(){}", "name": "New2", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "80a88d5a-e379-46b4-9ebe-834bad06dc94",
    "public": {"stringContent": "function New3(){}", "name": "New3", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "09fbf432-1ebf-4d88-96e9-781e5ae694d3",
    "public": {"stringContent": "function Old(){}", "name": "Old", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "f9f9ce97-efcb-4d1d-8406-5e1477929111",
    "public": {"stringContent": "function Old2(){}", "name": "Old2", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "76c1bccd-ab33-4d41-af9b-e0729a180709",
    "public": {"stringContent": "function Old3(){}", "name": "Old3", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "64384155-a392-4687-88f2-b62764275da8",
    "public": {"stringContent": "function Other(){}", "name": "Other", "isRef": null, "isRole": null}
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "c190c52e-e11a-4cce-8999-143b134bb111",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('User')}",
        "name": "User",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "cdfce4c0-36c8-4448-8f9e-f654001094c7",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('Admin')}",
        "name": "Admin",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributive",
    "options": {"isReactive": true},
    "uuid": "8271c7af-e142-495e-94ee-46a2fcf1682e",
    "public": {
        "stringContent": "function({ user }) { return user.roles.includes('Anonymous')}",
        "name": "Anonymous",
        "isRef": false,
        "isRole": true
    }
}, {
    "type": "UserAttributives",
    "options": {"isReactive": true},
    "uuid": "b7346637-4f7e-4d33-8f3b-de78f72c498a",
    "public": {
        "content": {
            "type": "group",
            "op": "&&",
            "left": {"type": "variable", "name": "New", "uuid": "22e84f84-4a9e-4fd0-b84c-4a165f10675a"},
            "right": {"type": "variable", "name": "Old2", "uuid": "f9f9ce97-efcb-4d1d-8406-5e1477929111"}
        }
    }
}, {"type": "Action", "uuid": "fc1510d2-6961-484c-80ab-cc9ad6d9c022", "public": {"name": "get"}}, {
    "type": "Action",
    "options": {"isReactive": true},
    "uuid": "4ae53d70-287c-47a1-bf67-c0df0b38897b",
    "public": {"name": "sendRequest"}
}, {
    "type": "Payload",
    "options": {"isReactive": true},
    "uuid": "e087ad0d-02cc-4fe8-a078-4929995f9d6d",
    "public": {}
}, {
    "type": "Interaction",
    "options": {"isReactive": true},
    "uuid": "2b6308d7-d130-4ff9-8103-0d705198fa30",
    "public": {
        "name": "sendRequest",
        "userAttributives": "b7346637-4f7e-4d33-8f3b-de78f72c498a",
        "userRoleAttributive": "cdfce4c0-36c8-4448-8f9e-f654001094c7",
        "userRef": "90ea53a5-953a-4e35-b248-395cd5d80623",
        "action": "4ae53d70-287c-47a1-bf67-c0df0b38897b",
        "payload": "e087ad0d-02cc-4fe8-a078-4929995f9d6d"
    }
}]