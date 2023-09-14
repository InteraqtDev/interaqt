import {CircularRef, ClassDef, createClass} from "../createClass";

const def:ClassDef = {
    name: 'MapActivityToEntity',
    public: {
        source: {
            // TODO 这里不能引用 Activity，因为 Activity 里面有引用了 Entity。会变成 三者循环引用。所以在下面修补。
            //  怎么办？？？
            type: CircularRef,
        },
        handle: {
            type: 'string'
        }
    }
}

export const MapActivityToEntity = createClass(def)