export function InteractionGroupNode({ group }, {createElement}){
    return (
        <div style={{border: "1px dashed red"}}>
            <div className="text-center">
                {group.type}
            </div>
        </div>
    )
}
