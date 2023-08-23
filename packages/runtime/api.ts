import Program, { Plugin } from "../../program/Program";
import {Interaction} from "../types";
import {recursiveConvertActivityInteraction} from "./callInteraction";




export default function createAPIs(program: Program, plugins: Plugin[]) {

    const pathToInteractions = new Map<string, [string[], Interaction]>()

    program.modules.forEach((module, moduleName) => {
        // activity 转 interaction
        module.activities.forEach((activity, activityName) => {
            const interactionsWithIndex = recursiveConvertActivityInteraction(activity, [moduleName, activityName], activity, program.concepts)
            interactionsWithIndex.forEach(([index, interaction]) => {
                pathToInteractions.set(index.join('/'), interaction)
            })
        })

        // interaction
        module.interactions.forEach((interaction, name) => {
            pathToInteractions.set(`${moduleName}/${name}`, interaction)
        })

    })

    // 执行全局 plugin 逻辑，用来支持 rbac crud 等等。
    plugins.forEach(plugin => {

    })





}
