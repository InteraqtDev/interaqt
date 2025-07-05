import { Interaction, Action, Payload, PayloadItem, Attributive, BoolExp, boolExpToAttributives } from 'interaqt';
import { Style, Version } from '../entities';

// Define permission attributives
const AuthenticatedUser = Attributive.create({
  name: 'AuthenticatedUser',
  content: function(targetUser, eventArgs) {
    return eventArgs.user && eventArgs.user.role;
  }
});

// GetStyles query interaction
export const GetStyles = Interaction.create({
  name: 'GetStyles',
  action: Action.create({ name: 'getStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'sortBy' }),
      PayloadItem.create({ name: 'sortOrder' })
    ]
  }),
  // Permission: any authenticated user
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AuthenticatedUser)
  )
});

// GetStyleDetail query interaction
export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: Action.create({ name: 'getStyleDetail' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleId', 
        base: Style, 
        isRef: true 
      })
    ]
  }),
  // Permission: any authenticated user
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AuthenticatedUser)
  )
});

// GetVersionHistory query interaction
export const GetVersionHistory = Interaction.create({
  name: 'GetVersionHistory',
  action: Action.create({ name: 'getVersionHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleId', 
        base: Style, 
        isRef: true 
      })
    ]
  }),
  // Permission: any authenticated user
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AuthenticatedUser)
  )
}); 