/* @jsx createElement */
import {atom, RenderContext, createContext} from 'axii'

import {RootContext} from "./RootContext.js";

export function Child({}, { createElement, context }: RenderContext) {
    return (
        <div style={{color: context.get(RootContext)}}>
            child component
        </div>
    )
}