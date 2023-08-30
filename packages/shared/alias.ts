import {KlassType} from "./createClass";

export class ConceptAlias{
    public for: KlassType<any>[]
    include(t: KlassType<any>) {
        this.for.push(t)
    }
}
