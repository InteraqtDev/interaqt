import {atom} from "data0";

export function Checkbox({value, label, tooltip = atom('')}, {createElement}) {
    return (
        <div className="relative flex items-start">
            <div className="flex h-6 items-center">
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                    value={value}
                    onChange={e => value(!value())}
                />
            </div>
            <div className="ml-3 text-sm leading-6">
                <label className="font-medium text-gray-900">
                    {label}
                </label>
                <span id="comments-description" className="text-gray-500">
                  <span className="sr-only">{label} </span><span>{tooltip}</span>
                </span>
            </div>
        </div>
    )
}
