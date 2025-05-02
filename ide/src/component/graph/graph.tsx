import {
    CanvasEventType,
    default as G6,
    Graph as G6Graph,
    GraphOptions,
    ICombo,
    IEdge,
    IG6GraphEvent,
    INode
} from '@antv/g6'
import {atom, Atom, computed, incIndexBy, incMap, isReactive, TrackOpTypes, TriggerOpTypes} from "data0";
import {hasOwn} from "../../util";


type Node = {
    [k: string]: any,
    id: string
}
type Edge = {
    [k: string]: any,
    id: string
}

type Combo = {
    [k: string]: any,
    id: string
}


function createDefaultPositionGenerator(gapX:number = 200, gapY:number = 100) {
    let lastX = 0
    let lastY = 0
    return function createDefaultPosition() {
        return {
            x: (lastX += gapX),
            y: (lastY += gapY),
        }
    }
}


G6.registerNode('rect-node', {
    // afterDraw(cfg, group) {
        // CAUTION 因为添加了节点之后，肯定都会要从 dom 同步一次宽高，所以 afterDraw 这里没有必要执行了。
    // },
    afterUpdate(cfg, node) {
        const group = node?.getContainer()
        const anchors = node.getContainer().findAll(ele => ele.get('name') === 'anchor-point');
        anchors.forEach(anchor => anchor.remove())

        // TODO 改成调整位置？不需要每次都生成？
        const bbox = group!.getBBox();
        const anchorPoints = this.getAnchorPoints(cfg)

        anchorPoints.forEach((anchorPos, i) => {
            group.addShape('circle', {
                attrs: {
                    r: 5,
                    x: bbox.x + bbox.width * anchorPos[0],
                    y: bbox.y + bbox.height * anchorPos[1],
                    fill: '#fff',
                    stroke: '#5F95FF'
                },
                // must be assigned in G6 3.3 and later versions. it can be any string you want, but should be unique in a custom item type
                name: `anchor-point`, // the name, for searching by group.find(ele => ele.get('name') === 'anchor-point')
                anchorPointIdx: i, // flag the idx of the anchor-point circle
                links: 0, // cache the number of edges connected to this shape
                visible: false, // invisible by default, shows up when links > 1 or the node is in showAnchors state
                draggable: true // allow to catch the drag events on this shape
            })
        })
    },
    getAnchorPoints(cfg) {
        return cfg.anchorPoints || [[0, 0.5], [0.33, 0], [0.66, 0], [1, 0.5], [0.33, 1], [0.66, 1]];
    },
    // response the state changes and show/hide the link-point circles
    setState(name, value, item) {
        if (name === 'showAnchors') {
            const anchorPoints = item.getContainer().findAll(ele => ele.get('name') === 'anchor-point');
            anchorPoints.forEach(point => {
                if (value || point.get('links') > 0) point.show()
                else point.hide()
            })
        }
    }
}, 'rect')


type CanvasEventListeners  = {
  [k in CanvasEventType]: (event: IG6GraphEvent) => void
}


class XGraph {
    public graph: G6Graph
    nodeComputed: ReturnType<typeof computed>
    combosComputed: ReturnType<typeof computed>
    edgeComputed: ReturnType<typeof computed>
    public nodeToGraphNode = new Map<any, INode>()
    public nodeToDOMNode = new Map<any, HTMLElement>()
    public comboToGraphNode = new Map<any, ICombo>()
    public comboToDOMNode = new Map<any, HTMLElement>()
    public edgeToGraphEdge = new Map<any, IEdge>()
    public edgeToDOMNode = new Map<any, HTMLElement>()
    public resizeObserver: ResizeObserver
    public graphContainer:HTMLElement
    createDefaultPosition: ReturnType<typeof createDefaultPositionGenerator>
    scheduleLayoutTask: any = null
    constructor(
        public options: Omit<GraphOptions, 'container'>,
        public nodes: Node[],
        public edges: Edge[],
        public combos: Combo[],
        public Component: (any) => JSX.Element,
        public Edge: (any) => JSX.Element,
        public Combo: (any) => JSX.Element,
        public isEditingNode = atom(false),
        public canvasEventListeners?: CanvasEventListeners,
        public nodeProps?: object
    ) {
        // TODO 配置
        this.createDefaultPosition = createDefaultPositionGenerator(0, 200)
    }
    drawGraph() {
        this.graph = new G6Graph({ ...this.options, container: this.graphContainer })

        this.linkCombosAndGraphPlaceholder()

        this.linkNodesAndGraphPlaceholder()

        this.linkEdgeAndGraphLabel()
        this.listenCreateEdge()
        this.listenAnchorEvents()
        this.listenLayoutAndPosChange()

        this.attachCanvasListeners()

        this.scheduleLayout()
    }
    scheduleLayout() {
        if (this.scheduleLayoutTask) return

        this.scheduleLayoutTask = setTimeout(() => {
            this.graph.layout()
            this.scheduleLayoutTask = null
        }, 1)
    }
    attachCanvasListeners() {
        if (this.canvasEventListeners) {
            Object.entries(this.canvasEventListeners).forEach(([eventName, callback]) => {
                this.graph.on(eventName, callback)
            })
        }
    }
    listenAnchorEvents() {
        this.graph.on('node:mouseenter', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:mouseleave', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
        this.graph.on('node:dragenter', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:dragleave', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
        this.graph.on('node:dragstart', e => {
            this.graph.setItemState(e.item!, 'showAnchors', true);
        })
        this.graph.on('node:dragout', e => {
            this.graph.setItemState(e.item!, 'showAnchors', false);
        })
    }
    listenCreateEdge() {
        this.graph.on('aftercreateedge', (event) => {
            debugger
        })
    }
    render(createElement) {
        this.graphContainer = <div style={{position:'absolute', top:0, left:0, width: '100%', height: '100%' }}></div> as HTMLElement

        const { Component, Edge, Combo, nodeProps } = this
        const nodeAndDOMNodes = incMap(this.nodes, (node) => ({node, dom: <div style={{display:'inline-block', position:'absolute'}}><Component node={node} nodeProps={nodeProps}/></div> }))
        this.nodeToDOMNode = incIndexBy(nodeAndDOMNodes, 'node', ({dom}) => dom) as Map<string, HTMLElement>

        const comboAndDOMNodes = incMap(this.combos, (combo) => ({combo, dom: <div style={{display:'inline-block', position:'absolute'}}><Combo node={combo}/></div> }))
        this.comboToDOMNode = incIndexBy(comboAndDOMNodes, 'combo', ({dom}) => dom) as Map<string, HTMLElement>


        const edgeAndDOMNodes = incMap(this.edges, (edge) => ({edge, dom: <div style={{display:'inline-block', position:'absolute'}}><Edge edge={edge}/></div> }))
        this.edgeToDOMNode = incIndexBy(edgeAndDOMNodes, 'edge', ({dom}) => dom) as Map<string, HTMLElement>

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // TODO update placehoder 的尺寸
                console.log(entry.borderBoxSize)
            }
        });

        return <div style={{position: 'relative', border: '1px blue dashed', width: this.options.width, height: this.options.height}}>
            <div style={{position:'absolute', width: 0, height:0, left: 0, top:0, overflow:'visible'}} className={() => this.isEditingNode() ? 'z-20' : ''}>
                {incMap(comboAndDOMNodes, ({ dom }) => dom)}
            </div>
            <div style={{position:'absolute', width: 0, height:0, left: 0, top:0, overflow:'visible'}} className={() => this.isEditingNode() ? 'z-20' : ''}>
                {incMap(nodeAndDOMNodes, ({ dom }) => dom)}
            </div>
            <div className="z-0">
                {this.graphContainer}
            </div>
            <div style={{position:'absolute', width: 0, height:0, left: 0, top:0, overflow:'visible'}}>
                {incMap(edgeAndDOMNodes, ({ dom }) => dom)}
            </div>
        </div>
    }
    createPlaceholder(node: Node): Parameters<typeof this.graph.addItem> {
        const defaultPosition = hasOwn(node, 'x') ? null : this.createDefaultPosition()
        // ModelConfig 类型定义错误，不能写 raw: node。
        // @ts-ignore
        return [
            'node',
            {
                id: (node.id as string),
                raw: node,
                comboId: node.comboId,
                type: 'rect-node',
                // x: (node.x as number) ?? defaultPosition.x,
                // y: (node.y as number)  ?? defaultPosition.y,
                style: {
                    opacity: .5,
                    stroke: '#328572',
                },
                anchorPoints: [
                    [.5, 0],
                    [.5, 1],
                    [1, .5],
                    [0, .5],
                ]
            },
            false,
            false
        ]
    }
    createComboPlaceholder(node: Node): Parameters<typeof this.graph.addItem> {
        const defaultPosition = hasOwn(node, 'x') ? null : this.createDefaultPosition()
        // ModelConfig 类型定义错误，不能写 raw: node。
        // @ts-ignore
        return [
            'combo',
            {
                id: (node.id as string),
                raw: node,
                type: 'rect',
                // x: (node.x as number) ?? defaultPosition.x,
                // y: (node.y as number)  ?? defaultPosition.y,
                style: {
                    opacity: .5,
                    stroke: '#328572',
                },
                anchorPoints: [
                    [.5, 0],
                    [.5, 1],
                    [1, .5],
                    [0, .5],
                ]
            },
            false,
            false
        ]
    }
    addPlaceholder(node: Node) {
        const graphNode = this.graph.addItem(...this.createPlaceholder(node))
        this.nodeToGraphNode.set(node, graphNode as INode)

        const domNode = this.nodeToDOMNode.get(node)
        this.resizeObserver.observe(domNode)
        this.syncDOMSizeToGraphNode(node)
    }
    addComboPlaceholder(node: Combo) {
        const graphNode = this.graph.addItem(...this.createComboPlaceholder(node))
        this.comboToGraphNode.set(node, graphNode as ICombo)
    }
    removeComboPlaceholder(node: Combo) {
        const graphNode = this.nodeToGraphNode.get(node)
        this.graph.removeItem(graphNode)
    }
    syncDOMSizeToGraphNode(node) {
        const domNode = this.nodeToDOMNode.get(node)
        const graphNode = this.nodeToGraphNode.get(node)
        const width = domNode.clientWidth
        const height = domNode.clientHeight
        graphNode.update({style: { height, width }}, 'style')
    }
    syncNodePosToDOM(node) {
        const graphNode = this.nodeToGraphNode.get(node)
        const dom = this.nodeToDOMNode.get(node)
        const box = graphNode.getBBox()
        dom.style.top = `${box.y}px`
        dom.style.left = `${box.x}px`

        if (graphNode.getModel().comboId) {
            const combo = this.combos.find(combo => combo.id = graphNode.getModel().comboId)
            // CAUTION 布局任务被优化了，所以这也要扔到后面去。
            Promise.resolve().then(() => {
                this.syncComboPosAndSizeToDOM(combo)
            })
        }
    }
    syncComboPosAndSizeToDOM(combo) {
        const graphNode = this.comboToGraphNode.get(combo)
        const dom = this.comboToDOMNode.get(combo)
        const box = graphNode.getBBox()
        dom.style.top = `${box.y}px`
        dom.style.left = `${box.x}px`
        dom.style.width = `${box.width}px`
        dom.style.height = `${box.height}px`
        // TODO 递归？
    }
    removePlaceholder(node: any) {
        const graphNode = this.nodeToGraphNode.get(node)
        this.graph.removeItem(graphNode)

        const domNode = this.nodeToDOMNode.get(node)
        this.resizeObserver.unobserve(domNode)
    }
    listenLayoutAndPosChange() {
        this.graph.on('afterlayout', () => {
            this.nodes.forEach(node => {
                this.syncNodePosToDOM(node)
            })

            this.edges.forEach(edge => {
                this.syncEdgeLabelPos(edge)
            })

            this.combos.forEach(node => {
                this.syncComboPosAndSizeToDOM(node)
            })
        })


        this.graph.on('afterupdateitem', (event) => {
            const item = event.item as INode
            const node = item.getModel().raw
            if (node.isGroup) {
                this.syncComboPosAndSizeToDOM(node)
                // 更新所有节点和
                this.nodes.forEach(n => {
                    if (n.comboId === node.id) this.syncNodePosToDOM(n)
                })
            } else {
                this.syncNodePosToDOM(node)
                // 关联 edge label 也要重算
                item.getEdges().forEach(graphEdge => {
                    this.syncEdgeLabelPos(graphEdge.getModel().raw)
                })
            }
        })
    }

    linkNodesAndGraphPlaceholder() {
        this.nodeComputed = computed(
            (track) => {
                track!(this.nodes, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(this.nodes, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return this.nodes.forEach((node: any, index) => this.addPlaceholder(node))
            },
            (data, triggerInfos) => {
                triggerInfos.forEach(({ method , argv, result}) => {
                    if(!method && !result) throw new Error('trigger info has no method and result')
                    if (method === 'push' || method === 'shift') {
                        result!.add!.forEach(({key, newValue}) => {
                            this.addPlaceholder(newValue)
                        })
                    } else if (method === 'pop' || method === 'shift') {
                        result!.remove!.forEach(({key, oldValue}) => {
                            this.removePlaceholder(oldValue)
                        })
                    } else if (method === 'splice' || !method) {
                        result!.add?.forEach(({key, newValue}) => {
                            this.addPlaceholder(newValue)
                        })
                        result!.update?.forEach(({key, oldValue, newValue}) => {
                            this.removePlaceholder(oldValue)
                            this.addPlaceholder(newValue)
                        })
                        result!.remove?.forEach(({key, oldValue}) => {
                            this.removePlaceholder(oldValue)
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            }
        )
    }
    linkCombosAndGraphPlaceholder() {
        this.combosComputed = computed(
            (track) => {
                track!(this.combos, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(this.combos, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return this.combos.forEach((node: any, index) => this.addComboPlaceholder(node))
            },
            (data, triggerInfos) => {
                triggerInfos.forEach(({ method , argv, result}) => {
                    if(!method && !result) throw new Error('trigger info has no method and result')
                    if (method === 'push' || method === 'shift') {
                        result!.add!.forEach(({key, newValue}) => {
                            this.addComboPlaceholder(newValue)
                        })
                    } else if (method === 'pop' || method === 'shift') {
                        result!.remove!.forEach(({key, oldValue}) => {
                            this.removeComboPlaceholder(oldValue)
                        })
                    } else if (method === 'splice' || !method) {
                        result!.add?.forEach(({key, newValue}) => {
                            this.addComboPlaceholder(newValue)
                        })
                        result!.update?.forEach(({key, oldValue, newValue}) => {
                            this.removeComboPlaceholder(oldValue)
                            this.addComboPlaceholder(newValue)
                        })
                        result!.remove?.forEach(({key, oldValue}) => {
                            this.removeComboPlaceholder(oldValue)
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            }
        )
    }
    createLabel(edge): Parameters<typeof this.graph.addItem> {
        return [
            'edge',
            {
                type: 'polyline',
                raw: edge,
                id: edge.id,
                source: edge.source,
                target : edge.target,
                style: {
                    endArrow: true,
                }
            }
        ]
    }
    addLabel(edge) {
        const graphEdge = this.graph.addItem(...this.createLabel(edge))
        this.edgeToGraphEdge.set(edge, graphEdge as IEdge)
        this.syncEdgeLabelPos(edge)
    }
    syncEdgeLabelPos(edge) {
        const graphEdge = this.edgeToGraphEdge.get(edge)
        const domNode = this.edgeToDOMNode.get(edge)
        const box = graphEdge.getKeyShape().getPoint(0.5)
        domNode.style.left = `${box.x}px`
        domNode.style.top = `${box.y}px`
    }
    removeLabel(edge) {
        const graphEdge = this.edgeToGraphEdge.get(edge)
        this.graph.removeItem(graphEdge)
    }
    linkEdgeAndGraphLabel() {
        this.edgeComputed = computed(
            (track) => {
                track!(this.nodes, TrackOpTypes.METHOD, TriggerOpTypes.METHOD);
                track!(this.nodes, TrackOpTypes.EXPLICIT_KEY_CHANGE, TriggerOpTypes.EXPLICIT_KEY_CHANGE);
                return this.edges.forEach((edge,) => this.addLabel(edge))
            },
            (data, triggerInfos) => {
                triggerInfos.forEach(({ method , argv, result}) => {
                    if(!method && !result) throw new Error('trigger info has no method and result')
                    if (method === 'push' || method === 'shift') {
                        result!.add!.forEach(({key, newValue}) => {
                            this.addLabel(newValue)
                        })
                    } else if (method === 'pop' || method === 'shift') {
                        result!.remove!.forEach(({key, oldValue}) => {
                            this.removeLabel(oldValue)
                        })
                    } else if (method === 'splice' || !method) {
                        result!.add?.forEach(({key, newValue}) => {
                            this.addLabel(newValue)
                        })
                        result!.update?.forEach(({key, oldValue, newValue}) => {
                            this.removeLabel(oldValue)
                            this.addLabel(newValue)
                        })
                        result!.remove?.forEach(({key, oldValue}) => {
                            this.removeLabel(oldValue)
                        })
                    } else {
                        throw new Error('unknown trigger info')
                    }
                })
            }
        )
    }

}


export type GraphType = { options: object, nodes: Node[], edges: Edge[], Component: (any) => JSX.Element, Combo: (any) => JSX.Element, Edge: (any) => JSX.Element, isEditingNode: Atom<boolean>, canvasEventListeners: CanvasEventListeners}
export function Graph( { options, nodes, edges, combos, Component, Combo, Edge, nodeProps, isEditingNode, canvasEventListeners} : GraphType, {createElement,  useLayoutEffect}) {
    const graph = new XGraph(options, nodes, edges, combos, Component, Edge, Combo, isEditingNode, canvasEventListeners, nodeProps);
    useLayoutEffect(() => {
        graph.drawGraph()
    })
    return graph.render(createElement)
}
