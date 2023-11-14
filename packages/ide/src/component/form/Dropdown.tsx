import {onUpKey, onDownKey} from "axii";
import {Atom, computed, incMap} from "rata";
import {Klass} from "../../../../shared/createClass";

export function Dropdown({ index, options}, { createElement, ref }) {
    const setNextIndex = () => {
        if (index() < options.length -1) index(index()+1)
    }

    const setPrevIndex = () => {
        if (index() > -1) index(index() - 1)
    }

    computed(() => {
        if (index() > options.length) index(-1)
    })

    return <div ref='container' onKeydown={[onUpKey(setPrevIndex), onDownKey(setNextIndex)]} >
        {incMap(options, (option, i) => {
            const className = () => {
                const isCurrent = (i as Atom<boolean>)() === index()
                return {
                    'bg-indigo-500': isCurrent,
                    'text-white': isCurrent,
                    'cursor-pointer' : true,
                    'hover:bg-indigo-100': !isCurrent
                }
            }

            const displayValue = (option.constructor as Klass<object>).display?.(option) ?? option.toString()

            return (
                <div className={className}>
                    {displayValue}
                </div>
            )
        })}
    </div>
}