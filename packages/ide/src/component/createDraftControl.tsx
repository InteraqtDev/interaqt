import {createElement, Component, configure} from "axii";
import {deepClone} from "../../../shared/createClass";
import {atom, Atom, computed, isAtom, reactive} from "rata";
import {assert} from "../util";

type Options = {
    pushEvent: string,
    constraints?: {},
    toControlValue? : (value: any) => any,
    toDraft? : (controlValue: any) => any,
}

type RenderControlArg = {
    [k: string]: any,
    value: Atom,
    children? :any
    errors? :any[]
}

export function createDraftControl(Component: Component, options?: Options) {
    return function renderControl({value, children, errors = reactive([]), ...restProps}: RenderControlArg) {
        assert(isAtom(value), 'draft only accept atom value')

        const controlValue = atom(options?.toControlValue? options.toControlValue(value()) : deepClone(value()))

        function updateValue() {
            let toDraftError
            let draftValue
            try {
                draftValue = options?.toDraft ? options.toDraft(controlValue()) : controlValue()
            } catch(e) {
                toDraftError = e
            }

            if (!toDraftError) {
                // CAUTION 引用相同，说明更新过一次以后，value 直接使用了我们产生的controlValue对象，所以这个时候需要 cloneDeep
                const nextValue = draftValue === value() ? deepClone(draftValue) : draftValue
                // TODO 怎么跑 contraints ？？只有成功了以后才修改 value
                errors!.splice(0, Infinity)
                value(nextValue)
            } else {
                errors!.splice(0, Infinity, { type: 'toDraftError'})
            }
            return
        }

        let config = {}
        if (options?.pushEvent) {
            const [eleName, eventName] = options.pushEvent.split(':')
            config[eleName] = {
                props: {
                    [eventName]: () => {
                        updateValue()
                    }
                },
                children
            }
        } else {
            // FIXME 这里的 computed 没有销毁，会泄露到上层控制里，而且这里的写法也很变扭。
            let isInitial = true
            computed(() => {
                if (isInitial) {
                    controlValue()
                    isInitial = false
                } else {
                    updateValue()
                }

            })
        }

        // FIXME type
        // @ts-ignore
        return <Component value={controlValue} errors={errors} {...restProps}>{configure(config)}</Component>
    }
}
