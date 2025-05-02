import Fastify, {FastifyLoggerOptions, FastifyReply, FastifyRequest} from 'fastify'
import {Controller, USER_ENTITY} from "./Controller.js";
import {EventPayload, EventQuery, EventUser, InteractionEventArgs} from "./InteractionCall.js";
import {MatchExp} from "@storage";
import cors from 'cors'
import middie from '@fastify/middie'
import {assert} from "./util.js";
import {asyncInteractionContext} from "./asyncInteractionContext.js";

type ServerOptions = {
    port: number,
    host?: string,
    parseUserId: (headers: any) => Promise<string | undefined>
    cors? : Parameters<typeof cors>[0]
    logger? : FastifyLoggerOptions
}

export type APIBody = {
    activity?: string,
    interaction? : string,
    activityId?: string
    payload?: EventPayload
    query?: EventQuery
}

type SyncUserBody = {
    userId: string,
}

export type DataAPIContext = { user: EventUser }

export type DataAPIHandle = (this: Controller, context: DataAPIContext, ...rest: any[]) => any
export type DataAPIConfig = {
    params?: any[]|{},
    useNamedParams? :boolean,
    allowAnonymous?: boolean
}
export type DataAPI = DataAPIHandle & DataAPIConfig


export type DataAPIs = {
    [k:string] : DataAPI
}

type DataAPIClassParam<T extends any> = T & { fromValue: (value: any) => T }

function parseDataAPIParams(inputParams: DataAPIConfig["params"], api: DataAPI): DataAPIConfig["params"] {
    if (!api.params) {
        return inputParams
    }

    if (api.useNamedParams) {
        const params = api.params as {[k:string]:any}
        const objectParams = inputParams as {[k:string]:any}

        return Object.fromEntries(Object.entries(objectParams).map(([key, inputParam]) => {
            const param = params[key]

            if (param === undefined) return [key, inputParam]

            if (typeof param === 'string' || inputParam === undefined || inputParam === null) {
                // 'string'|'number'|'boolean'|'object'|'undefined'|'null'
                return [key, inputParam]
            } else if (typeof param === 'function') {
                // 对象
                if (!(param as DataAPIClassParam<any>).fromValue) {
                    throw new Error('Invalid Class param type, missing fromValue')
                }
                return [key, (param as DataAPIClassParam<any>).fromValue(inputParam)]
            } else {
                throw new Error('Invalid param type')
            }

        }))

    } else {
        const params = api.params as any[]

        const arrayParams = inputParams as any[]
        return arrayParams.map((inputParam, index) =>{
            const param = params[index]
            if (param === undefined) return inputParam

            if (typeof param === 'string' || inputParam === undefined || inputParam === null) {
                // 'string'|'number'|'boolean'|'object'|'undefined'|'null'
                return inputParam
            } else if (typeof param === 'function') {
                // 对象
                if (!(param as DataAPIClassParam<any>).fromValue) {
                    throw new Error('Invalid Class param type, missing fromValue')
                }
                return (param as DataAPIClassParam<any>).fromValue(inputParam)
            } else {
                throw new Error('Invalid param type')
            }
        })
    }


}


function withLogContext(asyncHandle: (request: FastifyRequest, reply: FastifyReply) => Promise<any>) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const logContext = {
            reqId: request.id
        }
        let result
        await asyncInteractionContext.run(logContext, async () => {
            result = await asyncHandle(request, reply)
        })
        return result
    }
}


export async function startServer(controller: Controller, options: ServerOptions, dataAPIs: DataAPIs = {}) {
    const fastify = Fastify({
        logger: options.logger||true
    })

    await fastify.register(middie)
    fastify.use(cors(options.cors))


    fastify.post('/interaction',  withLogContext(async (request,  reply) => {

        // 转发到 controller
            const {activity : activityName, activityId, interaction: interactionName, payload, query} = request.body as APIBody

            // 1. JWT 鉴权。获取用户身份
            const userId = await options.parseUserId(request.headers)
            if (!userId) {
                throw { statusCode: 401, message: 'Unauthorized' }
            }

            let user = await controller.system.storage.findOne(USER_ENTITY, MatchExp.atom({key:'id', value: ['=', userId]}), undefined, ['*'])
            if (!user) {
                throw { statusCode: 500, message: 'User not synced' }
            }

            const eventArgs: InteractionEventArgs = {
                user,
                payload,
                query
            }

            let result: any
            if (activityName) {
                // 还需要区分 create 和 call
                const activityCallId = controller.activityCallsByName.get(activityName)?.activity.uuid
                const interactionId = controller.activityCallsByName.get(activityName)!.interactionCallByName.get(interactionName!)?.interaction.uuid
                result = await controller.callActivityInteraction(activityCallId!, interactionId!, activityId, eventArgs)
            } else {
                const interactionId = controller.interactionCallsByName.get(interactionName!)?.interaction.uuid
                result = await controller.callInteraction(interactionId!, eventArgs)
            }

            // TODO 统一处理 result。如果有 error，也要记录
            if (result.error) {
                throw { statusCode: 400, body: result}
            }

            // reply.send(result)
            return result

    }))

    // data api
    fastify.post('/api/:apiName', withLogContext(async (request, reply) => {

        const params = request.params as {apiName: string}
        const api = dataAPIs[params.apiName]
        if (!api) {
            throw { statusCode: 404, message: `api ${params.apiName} not found` }
        }

        let user
        if (!api.allowAnonymous) {
            // 1. JWT 鉴权。获取用户身份
            const userId = await options.parseUserId(request.headers)
            if (!userId) {
                throw { statusCode: 401, message: 'Unauthorized' }
            }

            user = await controller.system.storage.findOne(USER_ENTITY, MatchExp.atom({key:'id', value: ['=', userId]}), undefined, ['*'])
            if (!user) {
                throw { statusCode: 500, message: 'User not synced' }
            }
        }

        // 参数
        const apiParams = parseDataAPIParams(request.body as DataAPIConfig["params"], api)

        let result
        if(api.useNamedParams) {
            result = await dataAPIs[params.apiName].call(controller, {
                user: user as EventUser
            }, apiParams)
        }else {
            result = await dataAPIs[params.apiName].call(controller, {
                user: user as EventUser
            }, ...(apiParams as any[]))
        }

        return result
    }))

    // 健康检测
    fastify.get('/ping', async (request, reply) => {
        reply.type('application/json').code(200)
        return { message: 'pong' }
    })

    fastify.listen({ port: options.port, host: options.host ?? 'localhost' }, (err, address) => {
        if (err) throw err
        // Server is now listening on ${address}
    })
}


export function createDataAPI(handle: DataAPIHandle, config: DataAPIConfig = {}): DataAPI {
    assert(!(handle as DataAPI).params, `handle seem to be already a api`)
    const { params,  allowAnonymous = false, useNamedParams = false } = config

    if (!useNamedParams) {
        const arrayParams = (params||[]) as any[]
        // 这里的 handle 会默认注入第一个参数为 context，所以下面的判断是 +2
        assert(handle.length < (arrayParams.length || 0) + 2, `Invalid params length, handle length :${handle.length}, params length: ${arrayParams.length}`)
    }

    const api = handle as DataAPI
    api.params = params
    api.allowAnonymous = allowAnonymous
    api.useNamedParams = useNamedParams
    return api
}

