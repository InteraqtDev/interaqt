/* @jsx createElement */
import {RenderContext} from 'axii'
import {createTransitionEvent, Machine} from 'statemachine0'
import {CommonState, ProcessingState} from "./CustomState.js";
import {checkCredential, log} from "./Middleware.js";

export function App({}, { createElement }: RenderContext) {

    const transitions = [{
        name:'t1', from:'initial', event:'process', to:'processing'
    }, {
        name:'t2', from:'processing', event:'done', to:'done'
    }, {
        name:'t3', from:'done', event:'reset', to:'initial'
    }]

    const stateMachine = new Machine('initial', transitions)

    stateMachine.addState(new CommonState('initial'))
    stateMachine.addState(new ProcessingState())
    stateMachine.addState(new CommonState('done'))

    stateMachine.addMiddleware('t1', checkCredential)
    stateMachine.addMiddleware('t3', log)


    return <div>
        <h2>Transitions</h2>
        <table>
            <thead>
            <tr>
                <th>from</th>
                <th>to</th>
                <th>event</th>
            </tr>
            </thead>
            <tbody>
            {transitions.map(t => <tr>
                <td>{t.from}</td>
                <td>{t.to}</td>
                <td>{t.event}</td>
            </tr>)}
            </tbody>
        </table>
        <h2>Current States</h2>
        <div>
            <table>
                <tbody>
                <tr>
                    <td>current state</td>
                    <td>{() => stateMachine.currentState().name}</td>
                </tr>
                <tr>
                    <td>rejection</td>
                    <td>{() => stateMachine.rejection() ? `${stateMachine.rejection()!.middleware.name}:${stateMachine.rejection()!.detail}` : 'null'}</td>
                </tr>
                </tbody>
            </table>
        </div>
        <h2>Actions</h2>
        <div>
            <button onClick={() => stateMachine.receive(createTransitionEvent('process'))}>
                send process event without credential
            </button>
        </div>
        <div>
            <button onClick={() => stateMachine.receive(createTransitionEvent('process', {credential: 'admin'}))}>
                send process event with credential
            </button>
        </div>
        <div>
            <button onClick={() => stateMachine.receive(createTransitionEvent('done'))}>
                send done event
            </button>
        </div>
        <div>
            <button onClick={() => stateMachine.receive(createTransitionEvent('reset'))}>
                send reset event
            </button>
        </div>

    </div>
}