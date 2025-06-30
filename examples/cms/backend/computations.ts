import { Count, MapOf, WeightedSummation, Match, StateMachine } from '@interaqt/runtime'
import { Style, Version } from './entities'
import { StyleVersionRelation } from './relations'

export const TotalStylesCount = Count.create({
  record: Style,
  recordName: 'Style'
})

export const PublishedStylesCount = Count.create({
  record: Style,
  recordName: 'Style',
  match: Match.create({
    'status': 'published'
  })
})

export const DraftStylesCount = Count.create({
  record: Style,
  recordName: 'Style',
  match: Match.create({
    'status': 'draft'
  })
})

export const OfflineStylesCount = Count.create({
  record: Style,
  recordName: 'Style',
  match: Match.create({
    'status': 'offline'
  })
})

export const StylesByTypeCount = MapOf.create({
  record: Style,
  recordName: 'Style',
  key: 'type',
  computation: Count.create({
    record: Style,
    recordName: 'Style'
  })
})

export const MaxStylePriority = WeightedSummation.create({
  record: Style,
  recordName: 'Style',
  value: 'priority',
  aggregator: 'max'
})

export const MinStylePriority = WeightedSummation.create({
  record: Style,
  recordName: 'Style',
  value: 'priority',
  aggregator: 'min'
})

export const StyleStatusStateMachine = StateMachine.create({
  states: ['draft', 'published', 'offline'],
  initial: 'draft',
  transitions: [
    {
      from: 'draft',
      to: 'published',
      condition: 'can_publish'
    },
    {
      from: 'published',
      to: 'offline',
      condition: 'can_take_offline'
    },
    {
      from: 'offline',
      to: 'published',
      condition: 'can_republish'
    },
    {
      from: 'published',
      to: 'draft',
      condition: 'can_unpublish'
    }
  ]
})

export const CurrentVersionCount = Count.create({
  record: Version,
  recordName: 'Version',
  match: Match.create({
    'is_current': true
  })
})