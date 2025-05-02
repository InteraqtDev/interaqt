import {createElement, propTypes} from "axii";
import {atom, incMap, reactive} from "data0";

export function Input({ value, placeholder, errors = [], label = atom(''), tooltip = atom('') }) {
    return (
        <div>
            {() => (label() || tooltip()) ? (
                <div className="flex justify-between">
                    {() => label() ? (<label className="block text-sm font-medium leading-6 text-gray-900">{label}</label>) : null}
                    {() => tooltip() ? (<span className="text-sm leading-6 text-gray-500">{tooltip}</span>) : null}
                </div>
            ): null }
            <div className="mt-2">
                <input
                   className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                   placeholder={placeholder}
                   value={value}
                   onInput={(e) => value(e.target.value)}
                />
            </div>
            {incMap(errors, (error) => (
                <p className="mt-2 text-sm text-gray-500" id="email-description">{error.message}</p>
            ))}
        </div>
    )
}

Input.propTypes = {
    value: propTypes.string.default(() => atom('')),
    placeholder: propTypes.string.default(() => atom('')),
    label: propTypes.string.default(() => atom('')),
    tooltip: propTypes.string.default(() => atom('')),
    errors: propTypes.array.default(() => reactive([])),
}
