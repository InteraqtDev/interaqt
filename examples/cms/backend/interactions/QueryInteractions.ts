import { 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Attributive,
  BoolExp,
  boolExpToAttributives
} from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'

// 任何登录用户都可以查询
const LoggedInUser = Attributive.create({
  name: 'LoggedInUser',
  content: function(this: any, { user }) {
    return !!user.id
  }
})

// QueryStyles 交互
export const QueryStyles = Interaction.create({
  name: 'QueryStyles',
  action: Action.create({ name: 'query' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'filter',
        isRef: false,
        required: false
        // { status?: string, type?: string, isDeleted?: boolean }
      }),
      PayloadItem.create({
        name: 'sort',
        isRef: false,
        required: false
        // { field: string, order: 'asc' | 'desc' }
      }),
      PayloadItem.create({
        name: 'pagination',
        isRef: false,
        required: false
        // { page: number, pageSize: number }
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(LoggedInUser)
  )
})

// QueryVersions 交互
export const QueryVersions = Interaction.create({
  name: 'QueryVersions',
  action: Action.create({ name: 'query' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'pagination',
        isRef: false,
        required: false
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(LoggedInUser)
  )
})

// QueryVersionStyles 交互
export const QueryVersionStyles = Interaction.create({
  name: 'QueryVersionStyles',
  action: Action.create({ name: 'query' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'versionId',
        base: Version,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(LoggedInUser)
  )
}) 