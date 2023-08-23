export function ActionInput({ value }, {createElement}) {
    return <input $input placeholder="action name" value={value} onChange={(e)=> value(e.target.value)}/>
}