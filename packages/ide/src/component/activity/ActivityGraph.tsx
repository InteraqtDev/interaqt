

import {createElement} from "axii";
import { InteractionNode } from "./InteractionNode";
import {Graph} from "../graph/graph";
import {atom, computed, incMap, reactive} from "rata";
import {GraphOptions} from "@antv/g6";
import {InteractionEdge} from "./InteractionEdge";
import {
    Action,
    Activity,
    Interaction,
    InteractionGroup,
    Payload,
    Role,
    RoleAttributive,
    Transfer
} from "../../../../shared/activity/InteractionClass";
import {ActivityNode} from "./AcitivityNode";
import hotkeys from "hotkeys-js";
import {service} from "../service";



// FIXME 目前没有递归处理 group
export function ActivityGraph({ value, roles, entities, roleAttributives, entityAttributives, selectedAttributive  }) {
    // TODO concat 如何仍然保持 incremental ?
    const nodes = computed(() => {
        return value.interactions.map(interaction => ({ id: interaction.uuid, raw: interaction })).concat(
            ...value.groups.map(group => group.interactions.map(interaction => ({ id: interaction.uuid, raw: interaction, comboId: group.uuid })))
        )
    })

    const nodeProps = {roles, entities, roleAttributives, entityAttributives, selectedAttributive }

    const combos = incMap(value.groups, group => ({ id: group.uuid, isGroup: true, raw: group}))

    window.activity = value

    const edges = incMap(value.transfers, transfer => ({
        id: crypto.randomUUID(),
        source: transfer.source().uuid,
        target: transfer.target().uuid
    }))


    let sourceAnchorIdx, targetAnchorIdx;
    // TODO 外部配置
    const options: Omit<GraphOptions, 'container'> = {
        width: 800,
        height: 1800,
        fitView: true,
        fitCenter: true,
        layout: {
            type: 'dagre',
            ranksep: 250,
            rankdir: 'TB',
            // TODO align center 现在无效
            align: undefined
        },
        groupByTypes: false,
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
        },
        defaultCombo: {
            type: 'rect'
        }

    }

    const listeners = {
        'canvas:dblclick': () => {
            isEditingNode(true)
        }
    }

    const isEditingNode = atom(false)

    hotkeys('cmd+s', (e) => {
        service.writeFile('app/test.json', JSON.stringify(nodes))
        e.preventDefault()
    })

    hotkeys('esc', (e) => {
        if (isEditingNode()) {
            isEditingNode(false)
        }
        e.preventDefault()
    })


    return <Graph options={options} nodes={nodes} edges={edges} combos={combos} Combo={ActivityNode} Component={ActivityNode} nodeProps={nodeProps} isEditingNode={isEditingNode} Edge={InteractionEdge} canvasEventListeners={listeners}/>
}