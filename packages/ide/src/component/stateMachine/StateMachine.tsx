import {createElement} from "axii";
import { StateNode } from "./StateNode";
import {Graph} from "../graph/graph";
import {reactive} from "rata";
import {GraphOptions} from "@antv/g6";
import {EventEdge} from "./EventEdge";


export function StateMachine() {

    const nodes = reactive([{
        id: crypto.randomUUID(),
        x: 100,
        y: 200,
    }, {
        id: crypto.randomUUID(),
        x: 100,
        y: 300,
    }, {
        id: crypto.randomUUID(),
        x: 100,
        y: 400,
    }])



    const edges = reactive([{
        id: crypto.randomUUID(),
        source: nodes[0].id,
        target: nodes[1].id,
    }])

    let sourceAnchorIdx, targetAnchorIdx;
    const options: Omit<GraphOptions, 'container'> = {
        width: 800,
        height: 800,
        fitView: true,
        fitCenter: true,
        modes: {
            // default: ['drag-canvas'],
            default: [
                'click-select',
                'drag-combo',
                {
                    type: 'drag-node',
                    shouldBegin: e => {
                        if (e.target.get('name') === 'anchor-point') return false;
                        return true;
                    }
                },
                // config the shouldBegin and shouldEnd to make sure the create-edge is began and ended at anchor-point circles
                {
                    type: 'create-edge',
                    trigger: 'drag', // set the trigger to be drag to make the create-edge triggered by drag
                    shouldBegin: e => {
                        // avoid beginning at other shapes on the node
                        if (e.target && e.target.get('name') !== 'anchor-point') return false;
                        sourceAnchorIdx = e.target.get('anchorPointIdx');
                        e.target.set('links', e.target.get('links') + 1); // cache the number of edge connected to this anchor-point circle
                        return true;
                    },
                    shouldEnd: e => {
                        // avoid ending at other shapes on the node
                        if (e.target && e.target.get('name') !== 'anchor-point') return false;
                        if (e.target) {
                            targetAnchorIdx = e.target.get('anchorPointIdx');
                            e.target.set('links', e.target.get('links') + 1);  // cache the number of edge connected to this anchor-point circle
                            return true;
                        }
                        targetAnchorIdx = undefined;
                        return true;
                    }
                }
            ],
            edit: ['click-select', 'drag-combo', 'drag-node', 'create-edge'],
        },
        defaultEdge: {
            type: 'polyline',
            style: {
                endArrow: true,
            }

        }
    }

    return <Graph options={options} nodes={nodes} edges={edges} Component={StateNode} Edge={EventEdge}/>
}