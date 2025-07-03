import { Property, Count } from 'interaqt'
import { User, Style, Version } from './entities'
import { UserStyleRelation, UserVersionRelation, StyleVersionRelation } from './relations'

// Add computed properties after all entities and relations are defined
// This avoids circular dependency issues

// Style entity computed properties
Style.properties.push(
  Property.create({
    name: 'version_count',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: StyleVersionRelation,
      direction: 'source'
    })
  })
)

// Version entity computed properties  
Version.properties.push(
  Property.create({
    name: 'style_count',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: StyleVersionRelation,
      direction: 'target'
    })
  })
)

// User entity computed properties
User.properties.push(
  Property.create({
    name: 'created_styles_count',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserStyleRelation,
      direction: 'source'
    })
  }),
  Property.create({
    name: 'created_versions_count',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserVersionRelation,
      direction: 'source'
    })
  })
)