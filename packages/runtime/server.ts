import Fastify from 'fastify'
import {Controller, USER_ENTITY} from "./Controller.js";
import {EventPayload, EventQuery, InteractionEventArgs} from "./types/interaction";
import {MatchExp} from "@interaqt/storage";
import cors from 'cors'
import middie from '@fastify/middie'

type ServerOptions = {
    port: number,
    parseUserId: (headers: any) => Promise<string | undefined>
}

type APIBody = {
    activity?: string,
    interaction? : string,
    activityId?: string
    payload?: EventPayload
    query?: EventQuery
}

type SyncUserBody = {
    userId: string,
}


export async function startServer(controller: Controller, options: ServerOptions) {

    // TODO log 中间件
    const fastify = Fastify({
        logger: true
    })

    await fastify.register(middie)
    // TODO 可配置 cors
    fastify.use(cors())

    // listen 外部系统的用户创建，同步到我们的系统中。
    // CAUTION webhook 的模式最适合 id 由外部分配。这也意味着我们的系统中不允许自己创建用户！！！。不然 id 同步会出大问题！！！
    fastify.post('/user/sync', async (request, reply) => {
        const {userId} = request.body as SyncUserBody
        // TODO 验证 id 不能重复。 er 里面应该也要验证。这里只是为了防止重复创建
        return await controller.system.storage.create(USER_ENTITY, {id: userId})
    })


    fastify.post('/api', async (request, reply) => {
        // 转发到 controller
        const {activity : activityName, activityId, interaction: interactionName, payload, query} = request.body as APIBody

        // 1. JWT 鉴权。获取用户身份
        const userId = await options.parseUserId(request.headers)
        if (!userId) {
            throw { statusCode: 401, message: 'Unauthorized' }
        }

        const user = await controller.system.storage.findOne(USER_ENTITY, MatchExp.atom({key:'id', value: ['=', userId]}), undefined, ['*'])
        if (!user) {
            throw { statusCode: 500, message: 'User not synced' }
        }

        // FIXME 用户访问系统时的身份？？？有 user/admin/system ???
        user.roles = ['user']

        const eventArgs: InteractionEventArgs = {
            user,
            payload,
            query
        }

        let result: any
        if (activityName) {
            // 还需要区分 create 和 call
            const activityCallId = controller.activityCallsByName.get(activityName)?.activity.uuid
            if (!activityId) {
                result = await controller.createActivity(activityCallId!)
            } else {
                const interactionId = controller.activityCallsByName.get(activityName)!.interactionCallByName.get(interactionName!)?.interaction.uuid
                result = await controller.callActivityInteraction(activityCallId!, interactionId!, activityId, eventArgs)
            }
        } else {
            const interactionId = controller.interactionCallsByName.get(interactionName!)?.interaction.uuid
            result = await controller.callInteraction(interactionId!, eventArgs)
        }

        // TODO 统一处理 result。如果有 error，也要记录
        if (result.error) {
            throw { statusCode: 400, body: result}
        }

        return result
    })


    fastify.get('/ping', async (request, reply) => {
        reply.type('application/json').code(200)
        return { message: 'pong' }
    })

    fastify.listen({ port: options.port }, (err, address) => {
        if (err) throw err
        // Server is now listening on ${address}
    })
}

