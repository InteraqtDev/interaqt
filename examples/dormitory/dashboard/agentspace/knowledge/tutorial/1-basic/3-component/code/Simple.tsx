import {RenderContext} from "axii";

export type SimpleProps = {
    foo: any,
    children: any
}

export function Simple({children, foo}:SimpleProps, {createElement}: RenderContext) {
    return (
        <div>
            <div>{foo}</div>
            <div>{children}</div>
        </div>
    )
}
