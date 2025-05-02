import { KlassOptions } from "../createClass.js";
import { Attributive } from "../attributive.js";

export function createUserRoleAttributive({ name, isRef = false }: { name?: string, isRef?: boolean }, options?: KlassOptions) {
    return new Attributive({
        name,
        content: name ?
            new Function('user', `return user.roles.includes('${name}')`) as (user: any) => boolean :
            function anyone() { return true },
        isRef,
    }, options)
}




