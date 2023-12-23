import {createElement, InjectHandles} from "axii";
import {atom, Atom} from "data0";
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {IMarkdownString} from "monaco-editor/esm/vs/editor/editor.api";
import './useWorker';

type HoverProp = { match : (...arg: any[]) => any, contents: (...arg: any[]) => IMarkdownString[]}

type CodeProp = {
    options?: Omit<Parameters<typeof monaco.editor.create>[1], 'value'>,
    value: Atom<string>,
    extraLib?: [string, string],
    hover?: HoverProp[]
}

export function Code({ value = atom(''), options, extraLib, hover }: CodeProp, { useLayoutEffect} : InjectHandles) {

    const container = <div style={{minHeight: 200}}></div>

    useLayoutEffect(() => {

        if (extraLib) {
            monaco.languages.typescript.javascriptDefaults.addExtraLib(extraLib[0], extraLib[1]);
        }

        if (hover?.length) {
            monaco.languages.registerHoverProvider('javascript', {
                provideHover: function(model, position) {
                    // Log the current word in the console, you probably want to do something else here.
                    const text = model.getWordAtPosition(position)
                    for(let hoverItem of hover) {
                        const matched = hoverItem.match(text?.word)
                        if (matched) {
                            return {
                                range: new monaco.Range(position.lineNumber, text?.startColumn!, position.lineNumber, text?.endColumn!),
                                contents: hoverItem.contents(matched)
                            };

                        }
                    }
                }
            });
        }

        const editor = monaco.editor.create(
            container as HTMLElement,
            {
                ...options,
                value: value()
            }
        );

        editor.addCommand(monaco.KeyCode.KeyS | monaco.KeyMod.CtrlCmd, (e, a) => {
            value(editor.getModel()?.getValue())
        })

        return () => {
            editor.dispose()
        }
    })

    return container
}
