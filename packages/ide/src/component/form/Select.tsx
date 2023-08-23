import {createElement, propTypes} from "axii";
import {ArrowIcon} from "../icons/Arrow";
import {atom, incMap, reactive} from "rata";
import {CheckIcon} from "../icons/Check";
import {mapClassNameToObject} from "../../util";

export function Select({ options, value, display, placeholder = atom(''), allowEmpty = atom(false), dropdownVisible = atom(false) }) {
    const dropdownClass = () => ({
        ...mapClassNameToObject("absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"),
        'hidden' : !dropdownVisible()
    })

    const buttonClass = () => ({
      ...mapClassNameToObject("relative w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left  shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"),
        'text-gray-900': !!value(),
        'text-gray-400': !value(),
    })

    return (
        <div className="relative">
            <button
                type="button"
                className={buttonClass}
                aria-haspopup="listbox" aria-expanded="true" aria-labelledby="listbox-label"
                onClick={() => dropdownVisible(true)}
            >
                <span className="block truncate">{() => value() ? display(value()) : placeholder}</span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    {ArrowIcon}
                </span>
            </button>
            <ul className={dropdownClass}
                tabIndex="-1"
                role="listbox"
                aria-labelledby="listbox-label"
                aria-activedescendant="listbox-option-3"
            >
                {() => allowEmpty() ? (
                    <li className="text-gray-400 relative cursor-pointer select-none py-2 pl-3 pr-9 hover:text-white hover:bg-indigo-600"
                        role="option"
                        onClick={[() => value(null), () => dropdownVisible(false)]}
                    >
                        <span className="font-normal block truncate">empty</span>
                    </li>
                ) : null}
                {incMap(options, (option) => (
                    <li className="text-gray-900 relative cursor-pointer select-none py-2 pl-3 pr-9 hover:text-white hover:bg-indigo-600"
                        role="option"
                        onClick={[() => value(option), () => dropdownVisible(false)]}
                    >
                        <span className="font-normal block truncate">{() => display(option)}</span>
                        <span className="text-indigo-600 absolute inset-y-0 right-0 flex items-center pr-4">
                            {() => value() === option ? <CheckIcon /> : null}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

Select.propTypes = {
    options: propTypes.array.default(() => reactive([])),
    selected: propTypes.any.default(() => atom(null))
}
