import {KlassOptions, ReactiveKlassOptions} from "../createClass.js";
import {Attributive} from "../attributive.js";

export function createUserRoleAttributive({name, isRef = false}: { name?: string, isRef?: boolean}, options?: KlassOptions|ReactiveKlassOptions) {
    return new Attributive({
        name,
        content: name ?
            new Function('user', `return user.roles.includes('${name}')`) :
            function anyone(){ return true},
        isRef,
    }, options)
}




