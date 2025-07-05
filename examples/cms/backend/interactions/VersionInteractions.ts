import { Interaction, Action, Payload, PayloadItem, Attributive, BoolExp, boolExpToAttributives } from 'interaqt';
import { Version } from '../entities/Version';

// Define permission attributives
const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user && eventArgs.user.role === 'admin';
  }
});

// RollbackVersion interaction
export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({ name: 'rollbackVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'versionId', 
        base: Version, 
        isRef: true 
      })
    ]
  }),
  // Permission: admin only
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
  )
  // This will:
  // 1. Create a new Version through Transform
  // 2. Restore Style data from the specified version
  // 3. Update Version active states through StateMachine
}); 