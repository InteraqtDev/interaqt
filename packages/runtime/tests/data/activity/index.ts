import "./user.js";
import "./createFriendRelationActivity.js";
import "./messageEntity.js";
import "./requestEntity.js";
import "./roles.js";
import "./states.js";
import "./friend.js";
import {removeAllInstance, stringifyAllInstances} from "@interaqt/shared";


export const data = JSON.parse(stringifyAllInstances())
removeAllInstance()
