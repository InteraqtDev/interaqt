import {ArrowIcon} from "../icons/Arrow";

export function RoleInput({}, {createElement}) {
    return (
        <div>
            <label htmlFor="combobox" className="block text-sm font-medium leading-6 text-gray-900">Assigned to</label>
            <div className="relative mt-2">
                <input id="combobox" type="text"
                       className="w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                       role="combobox" aria-controls="options" aria-expanded="false"/>
                <button type="button"
                        className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                    <ArrowIcon />
                </button>

                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    id="options" role="listbox">
                    <li className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-900" id="option-0"
                        role="option" tabIndex="-1">
                        <span className="block truncate">Leslie Alexander</span>

                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600">
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fill-rule="evenodd"
                                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                  clip-rule="evenodd"/>
                          </svg>
                        </span>
                    </li>

                </ul>
            </div>
        </div>
    )
}
