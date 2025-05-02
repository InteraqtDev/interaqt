import {onSelf} from "axii";
import {Close} from "../icons/Close";

export function Drawer({ title, visible, children }, {createElement}) {

    // FIXME 要支持的动画的话，整个 container 都要保持和动画一直的事件才 display none，不然就会干扰动画，需要一个 Transition.Root 来控制
    const slideClassName = () => ({
        'transform': true,
        'transition':true,
        'ease-in-out': true,
        'duration-500': true,
        'sm:duration-700': true,
        'translate-x-full': visible() !== true,
        'translate-x-0': visible() === true,
        'pointer-events-none':true,
        'fixed':true,
        'inset-y-0':true,
        'right-0':true,
        'flex':true,
        'max-w-full':true,
        'pl-10':true,
        'sm:pl-16':true,
    })

    // const backgroundClassName = () => ({
    //     'inset-0': true,
    //     'hidden': !visible()
    // })

    const containerClassName = () => ({
        'relative': true,
        'z-10': true,
        'hidden': !visible()
    })



    return (
        <div className={containerClassName} aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
            <div className='fixed inset-0' ></div>
            <div className="fixed inset-0 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden" onclick={onSelf(() => visible(false))}>
                    <div className={slideClassName}>
                        <div className="pointer-events-auto w-screen max-w-2xl">
                            <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                                <div className="px-4 sm:px-6">
                                    <div className="flex items-start justify-between">
                                        <h2 className="text-base font-semibold leading-6 text-gray-900"
                                            id="slide-over-title">{title}</h2>
                                        <div className="ml-3 flex h-7 items-center">
                                            <button type="button"
                                                    className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                                    onClick={()=>visible(false)}
                                            >
                                                <span className="absolute -inset-2.5"></span>
                                                <span className="sr-only">Close panel</span>
                                                <Close />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative mt-6 flex-1 px-4 sm:px-6">
                                    {children}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    )
}
