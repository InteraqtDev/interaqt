/* @jsx createElement*/
import {createElement} from "axii";
import { atom } from "rata";


export function createDialog(content: any, footer: any) {
    const visible = atom(false)
    const hide = () => {
        visible(false)
    }

    const dialog = (
        <div className={() => `relative z-10 ${visible() ? '' : 'hidden'}`} aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"  onClick={hide}></div>
            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                    <div
                        className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
                        <div>
                            <div className="mt-3 sm:mt-5">
                                {content}
                            </div>
                        </div>
                        {footer}
                    </div>
                </div>
            </div>
        </div>
    )

    return [visible, dialog]
}

type FooterButton = {
    text: string,
    onClick: () => any
}

export function createDialogFooter(buttons: FooterButton[]) {
    const gridClassName = buttons.length === 1 ? 'sm:grid-cols-1' : buttons.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
    return (
        <div className={`mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense ${gridClassName} sm:gap-3`}>
            {buttons.map((button) => (
                <button type="button"
                    onClick={button.onClick}
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-1">
                    {button.text}
                </button>)
            )}
        </div>
    )
}
