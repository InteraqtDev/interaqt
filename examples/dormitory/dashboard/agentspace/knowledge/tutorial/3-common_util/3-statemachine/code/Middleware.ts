import {MiddlewareNext, TransitionEvent} from "statemachine0";


export function log(next: MiddlewareNext, event: TransitionEvent) {
    console.log('transition start, event:', event)
    next()
    console.log('transition end')
}

export function checkCredential(next: MiddlewareNext, event: TransitionEvent) {
    const allowed = event.detail?.credential === 'admin'
    next(allowed, allowed ? undefined : 'not allowed')
}
