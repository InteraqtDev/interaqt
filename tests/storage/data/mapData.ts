import {MapData} from "@storage";

export const entityToTableMapData: MapData = {
    "links": {
        "File_owner_file_User": {
            "table": "File_owner_file_User",
            "relType": [
                "n",
                "1"
            ],
            "sourceRecord": "File",
            "sourceProperty": "owner",
            "targetRecord": "User",
            "targetProperty": "file",
            "recordName": "File_owner_file_User",
            "mergedTo": "source"
        },
        "File_owner_file_User_source": {
            "table": "File_owner_file_User_source",
            "sourceRecord": "File_owner_file_User",
            "sourceProperty": "source",
            "targetRecord": "File",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        },
        "File_owner_file_User_target": {
            "table": "File_owner_file_User_target",
            "sourceRecord": "File_owner_file_User",
            "sourceProperty": "target",
            "targetRecord": "User",
            "relType": [
                "n",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "source"
        },
        "Profile_owner_profile_User": {
            "table": "Profile_owner_profile_User",
            "relType": [
                "1",
                "1"
            ],
            "sourceRecord": "Profile",
            "sourceProperty": "owner",
            "targetRecord": "User",
            "targetProperty": "profile",
            "recordName": "Profile_owner_profile_User",
            "mergedTo": "combined"
        },
        "Profile_owner_profile_User_source": {
            "table": "Profile_owner_profile_User_source",
            "sourceRecord": "Profile_owner_profile_User",
            "sourceProperty": "source",
            "targetRecord": "Profile",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        },
        "Profile_owner_profile_User_target": {
            "table": "Profile_owner_profile_User_target",
            "sourceRecord": "Profile_owner_profile_User",
            "sourceProperty": "target",
            "targetRecord": "User",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        },
        "User_leader_member_User": {
            "table": "User_leader_member_User",
            "relType": [
                "n",
                "1"
            ],
            "sourceRecord": "User",
            "sourceProperty": "leader",
            "targetRecord": "User",
            "targetProperty": "member",
            "recordName": "User_leader_member_User",
            "mergedTo": "source"
        },
        "User_leader_member_User_source": {
            "table": "User_leader_member_User_source",
            "sourceRecord": "User_leader_member_User",
            "sourceProperty": "source",
            "targetRecord": "User",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        },
        "User_leader_member_User_target": {
            "table": "User_leader_member_User_target",
            "sourceRecord": "User_leader_member_User",
            "sourceProperty": "target",
            "targetRecord": "User",
            "relType": [
                "n",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "source"
        },
        "User_friends_friends_User": {
            "table": "User_friends_friends_User",
            "relType": [
                "n",
                "n"
            ],
            "sourceRecord": "User",
            "sourceProperty": "friends",
            "targetRecord": "User",
            "targetProperty": "friends",
            "recordName": "User_friends_friends_User"
        },
        "User_friends_friends_User_source": {
            "table": "User_friends_friends_User_source",
            "sourceRecord": "User_friends_friends_User",
            "sourceProperty": "source",
            "targetRecord": "User",
            "relType": [
                "n",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "source"
        },
        "User_friends_friends_User_target": {
            "table": "User_friends_friends_User_target",
            "sourceRecord": "User_friends_friends_User",
            "sourceProperty": "target",
            "targetRecord": "User",
            "relType": [
                "n",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "source"
        },
        "User_item_owner_Item": {
            "table": "User_item_owner_Item",
            "relType": [
                "1",
                "1"
            ],
            "sourceRecord": "User",
            "sourceProperty": "item",
            "targetRecord": "Item",
            "targetProperty": "owner",
            "recordName": "User_item_owner_Item",
            "mergedTo": "combined"
        },
        "User_item_owner_Item_source": {
            "table": "User_item_owner_Item_source",
            "sourceRecord": "User_item_owner_Item",
            "sourceProperty": "source",
            "targetRecord": "User",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        },
        "User_item_owner_Item_target": {
            "table": "User_item_owner_Item_target",
            "sourceRecord": "User_item_owner_Item",
            "sourceProperty": "target",
            "targetRecord": "Item",
            "relType": [
                "1",
                "1"
            ],
            "isSourceRelation": true,
            "mergedTo": "combined"
        }
    },
    "records": {
        "User": {
            "table": "Profile_User_Item",
            "attributes": {
                "name": {
                    "type": "string",
                    "field": "User_name"
                },
                "age": {
                    "type": "number",
                    "field": "User_age"
                },
                "id": {
                    "type": "id",
                    "field": "User_id"
                },
                "file": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "n"
                    ],
                    "recordName": "File",
                    "linkName": "File_owner_file_User",
                    "isSource": false
                },
                "profile": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "Profile",
                    "linkName": "Profile_owner_profile_User",
                    "isSource": false
                },
                "leader": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_leader_member_User",
                    "isSource": true,
                    "field": "User_leader"
                },
                "member": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "n"
                    ],
                    "recordName": "User",
                    "linkName": "User_leader_member_User",
                    "isSource": false
                },
                "friends": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "n"
                    ],
                    "recordName": "User",
                    "linkName": "User_friends_friends_User",
                    "isSource": false
                },
                "item": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "Item",
                    "linkName": "User_item_owner_Item",
                    "isSource": true
                }
            }
        },
        "Profile": {
            "table": "Profile_User_Item",
            "attributes": {
                "title": {
                    "type": "string",
                    "field": "Profile_title"
                },
                "id": {
                    "type": "id",
                    "field": "Profile_id"
                },
                "owner": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "Profile_owner_profile_User",
                    "isSource": true
                }
            }
        },
        "File": {
            "table": "File",
            "attributes": {
                "fileName": {
                    "type": "string",
                    "field": "File_fileName"
                },
                "id": {
                    "type": "id",
                    "field": "File_id"
                },
                "owner": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "File_owner_file_User",
                    "isSource": true,
                    "field": "File_owner"
                }
            }
        },
        "Item": {
            "table": "Profile_User_Item",
            "attributes": {
                "itemName": {
                    "type": "string",
                    "field": "Item_itemName"
                },
                "id": {
                    "type": "id",
                    "field": "Item_id"
                },
                "owner": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_item_owner_Item",
                    "isSource": false
                }
            }
        },
        "File_owner_file_User": {
            "table": "File",
            "attributes": {
                "id": {
                    "type": "id",
                    "field": "_rowId"
                },
                "source": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "File",
                    "linkName": "File_owner_file_User_source",
                    "isSource": true,
                    "field": "File_id"
                },
                "target": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "File_owner_file_User_target",
                    "isSource": true,
                    "field": "File_owner"
                }
            },
            "isRelation": true
        },
        "Profile_owner_profile_User": {
            "table": "Profile_User_Item",
            "attributes": {
                "id": {
                    "type": "id",
                    "field": "_rowId"
                },
                "source": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "Profile",
                    "linkName": "Profile_owner_profile_User_source",
                    "isSource": true,
                    "field": "Profile_id"
                },
                "target": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "Profile_owner_profile_User_target",
                    "isSource": true,
                    "field": "User_id"
                }
            },
            "isRelation": true
        },
        "User_leader_member_User": {
            "table": "Profile_User_Item",
            "attributes": {
                "id": {
                    "type": "id",
                    "field": "_rowId"
                },
                "source": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_leader_member_User_source",
                    "isSource": true,
                    "field": "User_id"
                },
                "target": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_leader_member_User_target",
                    "isSource": true,
                    "field": "User_leader"
                }
            },
            "isRelation": true
        },
        "User_friends_friends_User": {
            "table": "User_friends_friends_User",
            "attributes": {
                "id": {
                    "type": "id",
                    "field": "_rowId"
                },
                "source": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_friends_friends_User_source",
                    "isSource": true,
                    "field": "_source"
                },
                "target": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "n",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_friends_friends_User_target",
                    "isSource": true,
                    "field": "_target"
                }
            },
            "isRelation": true
        },
        "User_item_owner_Item": {
            "table": "Profile_User_Item",
            "attributes": {
                "id": {
                    "type": "id",
                    "field": "_rowId"
                },
                "source": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "User",
                    "linkName": "User_item_owner_Item_source",
                    "isSource": true,
                    "field": "User_id"
                },
                "target": {
                    "type": "id",
                    "isRecord": true,
                    "relType": [
                        "1",
                        "1"
                    ],
                    "recordName": "Item",
                    "linkName": "User_item_owner_Item_target",
                    "isSource": true,
                    "field": "Item_id"
                }
            },
            "isRelation": true
        }
    }
} as unknown as MapData

