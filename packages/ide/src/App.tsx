import { atom } from 'data0'
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

/* @jsx createElement */
export function App({}, { createElement }) {
    const title = atom('')
    return <div className="h-full">
        <Sidebar />
        <div className="lg:ml-full-menu sm:ml-mini-menu flex flex-col h-full">
            <Navbar title={title} />
            <main className="grow bg-gray-bg mr-6 border border-gray-bd1 rounded-[18px]">
                <div className="h-full relative">
                </div>
            </main>
            <div className='h-6 w-full shrink-0'></div>
        </div>
    </div>
}