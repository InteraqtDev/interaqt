import {BoolExpression, BoolExpressionNodeTypes, OperatorNames, VariableNode} from "../../../../runtime/types/boolExpression";
import { parse } from '../../../../runtime/boolExpression'
import {atom, computed, incFilter, reactive} from "data0";
import {nextJob} from "../../util";
import {createDraftControl} from "../createDraftControl";
import {Contenteditable, replaceLastText} from "../contenteditable/Contenteditable";
import {Dropdown} from "../form/Dropdown";
import {createEventTransfer, onDownKey, onEnterKey, onUpKey, InjectHandles, Props, configure} from "axii";


function renderAttrNode(createElement, Fragment,selectedAttributive, expression, availableAttrs?) {
    return <a href="#" style={{color: "blue", textDecoration:'underline'}} >{expression}</a>
}


function renderAttrExpression(createElement, Fragment, selectedAttributive, expression?: BoolExpression, mayNeedParams?: boolean, placeholder?: string) {
    if (!expression) return <div className="text-gray-400">{placeholder}</div>

    if ( expression.type === BoolExpressionNodeTypes.variable) {
        return renderAttrNode(createElement, Fragment,selectedAttributive, (expression as VariableNode).name)
    } else if (expression.type === BoolExpressionNodeTypes.group) {
        const needParams = expression.op === OperatorNames['||'] && mayNeedParams
        return expression.op === OperatorNames['!'] ?
            (
                <>
                    !
                    {renderAttrExpression(createElement, Fragment,selectedAttributive, expression.left, true)}
                </>
            ) : (
                 <>
                     {needParams ? '(' : null}
                     {renderAttrExpression(createElement, Fragment,selectedAttributive, expression.left, expression.op === '&&')}
                     {expression.op}
                     {renderAttrExpression(createElement, Fragment,selectedAttributive,  expression.right!, expression.op === '&&')}
                     {needParams ? ')' : null}
                 </>
            )
    } else {
        debugger
        throw new Error('unknown type')
    }
}


function AttrEditor({ value, onFocusout, errors, options}, { createElement, Fragment} ) {
    const lastConsecutiveInputValue = atom('')
    // 基于 contenteditable lastConsecutiveInputValue 还要再构建一下，因为我们把 && || 空格 等也看做中断。
    const lastAttrNameLike = computed(() => lastConsecutiveInputValue().match(/[0-9a-zA-Z_]+$/)?.[0] || '')

    const renderDraftControl = createDraftControl(Contenteditable, {
        pushEvent: 'container:onFocusout',
        // FIXME 还是想改成数组
        toControlValue: (rawValue) =>  <div className="px-4" $editingInput style={{minWidth:20, minHeight:20}} >{renderAttrExpression(createElement, Fragment, () => {}, rawValue)}</div>,
        toDraft: (controlValue) => (parse(controlValue.innerText, options)),
    })



    const insertAutoComplete = () => {
        // FIXME 理论上，因为修改该的是 contenteditable 的 value，所以应该改成包装在事件里的形式。
        //  见 https://z8lxoxwryu.feishu.cn/docx/E07Zd2Y2Ioy6BVxWj21cO3Smnmg?from=from_copylink
        if (dropdownIndex() > -1) {
            // TODO 应该是替换成 Concept node
            console.log('replacing', lastAttrNameLike())
            // CAUTION 这里取 name 一定要得到真正的 string，因为这个节点是个当成 value 用的 dom 节点，不是组件的一部分，atom 不会被转化。
            const matched = matchedOptions[dropdownIndex()]
            // 会触发 selection change，然后 consecutiveInput 就重置了
            replaceLastText(lastAttrNameLike().length, renderAttrNode(createElement, Fragment,() => {}, matched.name()))
            // 应该要触发 selection change，重置 lastConsecutiveInputValue
            // setTimeout(() => {
            //     console.log(lastAttrNameLike())
            // }, 1)
        }
    }

    const upKeyEventTransfer = createEventTransfer()
    const downKeyEventTransfer = createEventTransfer()

    const matchedOptions = incFilter(options, o => o.name().slice(0, lastAttrNameLike().length) === lastAttrNameLike() )



    const dropdownStyle = () => {
        if (!lastAttrNameLike() || !matchedOptions.length ) return {display: 'none'}

        const selection = window.getSelection()
        const range = selection.getRangeAt(0)
        // TODO 这里的 rect 的其实是在 consectuiveInput 完全改变后才能得到的，现在是因为触发 eventChange 的地方做了 setTimeout，但这不优雅
        const rect = range.getBoundingClientRect()
        return {display: 'block', background:'#fff', zIndex: 9999, top: rect.top + rect.height, left: rect.left, minWidth: 20, minHeight: 20}
    }

    const dropdownIndex = atom(-1) // 默认没有选中的

    const preventDefault = (e) => e.preventDefault()

    return <div className="relative" onFocusout={onFocusout}>
        {renderDraftControl({
            value,
            errors,
            lastConsecutiveInputValue,

            onKeydown:[
                onUpKey(upKeyEventTransfer.source),
                onDownKey(downKeyEventTransfer.source),
                onUpKey(preventDefault), // 因为 keyup 会让 contenteditable 光标往前
                onEnterKey(insertAutoComplete),
                onEnterKey(preventDefault) // 不需要回车换行
            ]
        })}
        <Dropdown index={dropdownIndex} options={matchedOptions}>
            {configure({
                container: {
                    props: {
                        style: dropdownStyle,
                        className: "absolute border-2 border-indigo-500",
                        onKeydown: onEnterKey(insertAutoComplete)
                    },
                    // 将 contenteditable 的事件转移过来。
                    eventTarget: [
                        upKeyEventTransfer.target,
                        downKeyEventTransfer.target,
                    ]
                }
            })}
        </Dropdown>
    </div>
}


// FIXME options 应该从 context 读合理，还是从这里传进来合理？？这还是个层级比较低的组件，就取 Context 是不是滥用了？？？
/* @jsx createElement */
export function AttributiveInput({ value, options = [], selectedAttributive }: Props, { createElement, Fragment,ref }: InjectHandles) {
    const editing = atom(false)
    const errors = reactive([])

    const onFocusout = () => {
        if (!errors.length) {
            editing(false)
        }
    }

    // 把各种不同的功能分开
    const onDblclick = [
        // TODO 状态修改也改成事件形式？例如 editing.setTrue ?? 还是 events.setEditing(() => editing(true))?
        () => editing(true),
        () => nextJob(() => {
            // TODO focus 要从 api 改成状态控制？
            // user.focusElement = xxxElement
            ref.editor!.ref!.editingInput!.focus!()
        })
    ]

    if (typeof value !== 'function') debugger

    return <div className="inline-block mr-4" onDblclick={onDblclick} >
        {() => {
            if (!value()?.content) return null
            return editing() ?
                <AttrEditor ref='editor' value={value().content} onFocusout={onFocusout} errors={errors} options={options} /> :
                renderAttrExpression(createElement, Fragment,selectedAttributive, value().content(), false, 'empty')
        }}
    </div>
}
