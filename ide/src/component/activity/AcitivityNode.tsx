import { createElement } from "axii";
import { InteractionNode } from "./InteractionNode";
import { InteractionGroupNode } from "./InteractionGroupNode";

export function ActivityNode({ node, nodeProps }) {
    return node.isGroup ? <InteractionGroupNode group={node.raw} {...nodeProps} /> : <InteractionNode interaction={node.raw} {...{ ...nodeProps }} />
}

