import {RenderContext} from "axii";
import {Action, STATUS_PENDING, STATUS_ERROR, STATUS_PROCESSING, STATUS_SUCCESS, STATUS_ABORT, STATUS_TYPE} from 'action0'

function wait(time: number) {
    return new Promise(resolve => {
        setTimeout(resolve, time)
    })
}

function statusString(status:STATUS_TYPE) {
    switch (status) {
        case STATUS_PENDING:
            return 'pending'
        case STATUS_PROCESSING:
            return 'processing'
        case STATUS_SUCCESS:
            return 'success'
        case STATUS_ERROR:
            return 'error'
        case STATUS_ABORT:
            return 'abort'
    }
}

export function ParallelActions({}, {createElement}:RenderContext) {
    const parallelAction = new Action(async (input:number) => {
        await wait(1000)
        return input+1
    }, {
        parallelLimit: 3
    })

    const p1 = parallelAction.run(1)
    const p2 = parallelAction.run(2)
    const p3 = parallelAction.run(3)

    return <div>
        <h1>parallel action</h1>
        <table>
            <thead>
            <tr>
                <th>name</th>
                <th>status</th>
                <th>data</th>
            </tr>
            </thead>
            <tbody>
                <tr>
                    <td>p1</td>
                    <td>{() => statusString(p1.status())}</td>
                    <td>{p1.data}</td>
                </tr>
                <tr>
                    <td>p2</td>
                    <td>{() => statusString(p2.status())}</td>
                    <td>{p2.data}</td>
                </tr>
                <tr>
                    <td>p3</td>
                    <td>{() => statusString(p3.status())}</td>
                    <td>{p3.data}</td>
                </tr>
            </tbody>
        </table>
    </div>
}
