/* @jsx createElement */
import {atom, RenderContext} from 'axii'
export function App({}, { createElement }: RenderContext) {

    const style= {
        // standard form, supports arrays
        margin: 10,
        // supports array format
        padding: [10, 20],
        // supports nesting + pseudo-classes
        '&:hover': {
            background:'blue'
        },
        // supports nesting
        '& span': {
            color: 'white'
        },
        // supports @ rules
        '@keyframes': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(359deg)' }
        },
        lineHeight: 0,
        animation: `@self 4s linear infinite`,
        transformOrigin: 'center center',
    }

    // TODO implement transition in array format

    return <div style={style}><span>in component</span></div>
}