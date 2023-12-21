// 这里的 contenteditable 组件和 richText 不是同一个东西。
// richText 的 value 是有业务语义的数据结构，这里的 value 就是 element children


import {atom, computed} from "data0";

function getSelectionRange() {
    const selection = window.getSelection()
    if (!selection.rangeCount) return null
    return selection.getRangeAt(0)
}

function hasCursor() {
    const selection = window.getSelection()
    return selection.rangeCount !== 0
}



export function Contenteditable({ value, errors, lastConsecutiveInputValue = atom(''), ...props }, {createElement, ref, useLayoutEffect}) {


    let lastCursorNode
    let lastCursorOffset
    const rememberNextCursor = (newOffsetDataLength, fromLastPos?) => {
        if (fromLastPos) {
            // fromLastPos 说明是可能是 compositionEnd 之类触发的，
            lastCursorOffset += newOffsetDataLength
        } else {
            const range = getSelectionRange()
            lastCursorNode = range?.startContainer
            lastCursorOffset = range?.startOffset + newOffsetDataLength
        }
        // console.warn('remember', lastCursorNode, lastCursorOffset)
    }

    const updateConsecutiveInput = (data) => {
        const range = getSelectionRange()
        // TODO 为了让外界获得准确的 range boundingClientRect
        setTimeout(() => {
            lastConsecutiveInputValue(
                data === undefined ?
                    '' :
                    (range?.collapsed ?
                        (lastConsecutiveInputValue() + data)
                        :data
                    )
            )
        }, 1)
    }

    const onKeydown = (e) => {
        if (!hasCursor()) {
            return
        }
        // -2 输入法中的  Keydown 不管。
        // 这里有关于 keydown 和输入法的问题的例子。虽然 keydown 发生在 compositionstart 前，但 keyCode === 229 能表示这个  keydown 是输入法的一部分。
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event
        if (e.isComposing || e.keyCode === 229) {
            return;
        }

        if(e.key.length === 1) {
            updateConsecutiveInput(e.key)
            rememberNextCursor(1)
        }
    }

    const onPaste = (e) => {
        const data =  e.clipboardData!.getData('text/plain')
        updateConsecutiveInput(data)
        rememberNextCursor(data.length)
        console.log(data)
    }

    let isInComposition = false
    const onCompositionstart = (e) => {
        isInComposition = true
        rememberNextCursor(0)
    }

    const onCompositionend = (e) => {
        isInComposition = false
        updateConsecutiveInput(e.data)
        rememberNextCursor(e.data.length, true)
    }

    const onBlur = () => {
        updateConsecutiveInput(undefined)
    }


    const onSelectionChange = () => {
        // 这里得判断到底是用户鼠标键盘移动导致的，还是 输入导致的。
        const range = getSelectionRange()
        // console.log("equal test",
        //     range?.startContainer === lastCursorNode || range?.startContainer.parentNode === lastCursorNode,
        //     isInComposition,
        //     range?.startOffset === lastCursorOffset,
        // )

        const isResultOfInput = isInComposition ||
                (range?.startContainer === lastCursorNode || range?.startContainer.parentNode === lastCursorNode) &&
                (range?.startOffset === lastCursorOffset)

        // console.log(isResultOfInput)
        console.info(isResultOfInput)
        // 清空
        if (!isResultOfInput) {
            updateConsecutiveInput(undefined)
        }
    }

    // TODO 有没有更好地方法？？
    useLayoutEffect(() => {
        document.addEventListener('selectionchange', onSelectionChange)
        return () => {
            document.removeEventListener('selectionchange', onSelectionChange)
        }
    })

    // 不要自己包装 computed，识别不了。
    const className = () => ({
        'border-b-2': true,
        'border-rose-500':errors.length,
        'border-indigo-500': !errors.length
    })

    return <div ref="container" {...props} className={className} >
        {() => {
            const inner = value() as HTMLElement
            inner.addEventListener('keydown', onKeydown)
            inner.addEventListener('paste', onPaste)
            inner.addEventListener('blur', onBlur)
            inner.addEventListener('compositionend', onCompositionend)
            inner.addEventListener('compositionstart', onCompositionstart)
            inner.setAttribute('contenteditable', 'true')

            return inner
        }}
    </div>
}

// selection helpers
export function replaceLastText(length, newNode) {
    const currentRange = getSelectionRange()
    if (!currentRange) throw new Error('no cursor')
    currentRange.setStart(currentRange.startContainer, currentRange.startOffset - length)
    currentRange.deleteContents()
    currentRange.insertNode(typeof newNode === 'string' ? document.createTextNode(newNode) : newNode)
    currentRange.collapse()
}
