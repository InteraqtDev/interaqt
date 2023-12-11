import Fastify, {FastifyLoggerOptions, FastifyReply, FastifyRequest} from 'fastify'
import {Controller, USER_ENTITY} from "./Controller.js";
import {EventPayload, EventQuery, EventUser, InteractionEventArgs} from "./types/interaction.js";
import {MatchExp} from "@interaqt/storage";
import cors from 'cors'
import middie from '@fastify/middie'
import {assert} from "./util.js";
import {asyncInteractionContext} from "./asyncInteractionContext.js";

type ServerOptions = {
    port: number,
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
    params?: any[],
    allowAnonymous?: boolean
}
export type DataAPI = DataAPIHandle & DataAPIConfig


export type DataAPIs = {
    [k:string] : DataAPI
}

type DataAPIClassParam<T extends any> = T & { fromValue: (value: any) => T }

function parseDataAPIParams(rawParams: any[], api: DataAPI) {
    const params = api.params
    if (!params) {
        return rawParams
    }

    return rawParams.map((rawParam, index) =>{
        const param = params[index]
        if (param === undefined) return rawParam

        if (typeof param === 'string') {
            // 'string'|'number'|'boolean'|'object'|'undefined'|'null'
            return rawParam
        } else if (typeof param === 'function') {
            // 对象
            if (!(param as DataAPIClassParam<any>).fromValue) {
                throw new Error('Invalid Class param type, missing fromValue')
            }
            return (param as DataAPIClassParam<any>).fromValue(rawParam)
        } else {
            throw new Error('Invalid param type')
        }
    })
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

    // listen 外部系统的用户创建，同步到我们的系统中。
    // CAUTION webhook 的模式最适合 id 由外部分配。这也意味着我们的系统中不允许自己创建用户！！！。不然 id 同步会出大问题！！！
    fastify.post('/user/sync', withLogContext(async (request, reply) => {
        const {userId} = request.body as SyncUserBody
        // 验证 id 不能重复。 er 里面应该也要验证。这里只是为了防止重复创建
        if(!(await controller.system.storage.findOne(USER_ENTITY, MatchExp.atom({key:'id', value: ['=', userId]}), undefined, ['*']))){
            return await controller.system.storage.create(USER_ENTITY, {id: userId})
        }
    }))


    fastify.post('/api',  withLogContext(async (request,  reply) => {

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
    fastify.post('/data/:apiName', withLogContext(async (request, reply) => {

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
        const apiParams = parseDataAPIParams(request.body as any[], api)

        const result = await dataAPIs[params.apiName].call(controller, {
            user: user as EventUser
        }, ...apiParams)

        return result
    }))

    // 健康检测
    fastify.get('/ping', async (request, reply) => {
        reply.type('application/json').code(200)
        return { message: 'pong' }
    })

    fastify.listen({ port: options.port }, (err, address) => {
        if (err) throw err
        // Server is now listening on ${address}
    })
}


export function createDataAPI(handle: DataAPIHandle, config: DataAPIConfig = {}): DataAPI {
    assert(!(handle as DataAPI).params, `handle seem to be already a api`)
    const { params = [],  allowAnonymous = false } = config
    // 这里的 handle 会默认注入第一个参数为 context，所以下面的判断是 +2
    assert(handle.length < (params.length || 0) + 2, 'Invalid params length');
    const api = handle as DataAPI
    api.params = params;
    api.allowAnonymous = allowAnonymous
    return api
}

