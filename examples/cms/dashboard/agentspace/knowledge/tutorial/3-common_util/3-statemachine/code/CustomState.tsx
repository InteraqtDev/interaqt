import {atom, RenderContext} from "axii";
import {State} from 'statemachine0'

export class CommonState extends State {
    public entered = atom(0)
    constructor(name: string) {
        super(name)
    }

    onEnter() {
        this.entered(this.entered.raw + 1)
    }

    onExit() {
    }
}

export class ProcessingState extends CommonState {
    abortController?:AbortController
    countDown = atom(0)
    constructor() {
        super('processing')
    }

    onEnter() {
    }
    runEffect() {
        this.abortController = new AbortController()
        return new Promise((resolve, reject) => {
            let timeoutId:any
            const timeoutCountDown = () => {
                this.countDown(this.countDown.raw - 1)
                if (this.countDown.raw === 0) {
                    timeoutId = setTimeout(timeoutCountDown, 1000)
                } else {
                    resolve('done')
                }
            }

            this.countDown(10)
            timeoutId = setTimeout(timeoutCountDown, 1000)

            this.abortController!.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId)
                reject('aborted')
            })
        })
    }
    abort() {
        this.abortController?.abort()
    }
}