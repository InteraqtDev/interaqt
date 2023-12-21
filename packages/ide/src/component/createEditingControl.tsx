import { createElement} from "axii";
import {Component} from "../global";
import {atom} from "data0";


type EditDef = {
    pull: () => {}
}

export type EditingControlDef = {
    pull: () => any,
    push: () => any,
    sync: () => any,
    value: any,
    type: any,
    Component: Component,
    editing?: EditDef
}

export function createEditingControl({
    value,
    type,
    push,
    sync,
    Component: Component,
    editing
}: EditingControlDef){

    const pushDraft = (draftValue) => {
        // TODO 如果有 继续的 push
        if(push) {
            push(draftValue)
        } else {
            // 把 value 画成 draftValue。
            sync(draftValue)
        }

    }

    const errors =[]

    const isEditing = atom(false)


    return <Component value={value} push={pushDraft} errors={errors} isEditing={isEditing}/>
}
