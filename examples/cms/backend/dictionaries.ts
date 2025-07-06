import { Dictionary, Count } from 'interaqt'
import { Style, Version } from './entities'

export const SystemStatsDict = Dictionary.create({
  name: 'systemStats',
  type: 'object',
  collection: false,
  defaultValue: () => ({
    totalStyles: 0,
    publishedStyles: 0,
    draftStyles: 0
  })
})

export const CurrentVersionDict = Dictionary.create({
  name: 'currentVersion',
  type: 'string',
  collection: false,
  defaultValue: () => 'v1.0.0'
})