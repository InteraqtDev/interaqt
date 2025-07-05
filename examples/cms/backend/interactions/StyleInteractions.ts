import { Interaction, Action, Payload, PayloadItem, Attributive, BoolExp, boolExpToAttributives } from 'interaqt';
import { Style } from '../entities/Style';
import { User } from '../entities/User';

// Define permission attributives
const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user && eventArgs.user.role === 'admin';
  }
});

const OperatorOrAdminRole = Attributive.create({
  name: 'OperatorOrAdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user && (eventArgs.user.role === 'operator' || eventArgs.user.role === 'admin');
  }
});

// Style state attributives
const StyleNotOffline = Attributive.create({
  name: 'StyleNotOffline',
  content: async function(targetStyle, eventArgs) {
    // Check that the style in payload is not offline
    const style = eventArgs.payload?.styleId;
    return style && style.status !== 'offline';
  }
});

const StyleIsDraft = Attributive.create({
  name: 'StyleIsDraft',
  content: async function(targetStyle, eventArgs) {
    // Check that the style in payload is draft
    const style = eventArgs.payload?.styleId;
    return style && style.status === 'draft';
  }
});

// CreateStyle interaction
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  }),
  // Permission: admin or operator
  // userAttributives: boolExpToAttributives(
  //   BoolExp.atom(OperatorOrAdminRole)
  // )
});

// UpdateStyle interaction
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority' })
    ]
  }),
  // Permission: admin or operator, and style must not be offline
  // userAttributives: boolExpToAttributives(
  //   BoolExp.atom(OperatorOrAdminRole)
  //     .and(BoolExp.atom(StyleNotOffline))
  // )
});

// DeleteStyle interaction (soft delete)
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true })
    ]
  }),
  // Permission: admin only
  // userAttributives: boolExpToAttributives(
  //   BoolExp.atom(AdminRole)
  // )
});

// PublishStyle interaction
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true })
    ]
  }),
  // Permission: admin or operator, and style must be draft
  // userAttributives: boolExpToAttributives(
  //   BoolExp.atom(OperatorOrAdminRole)
  //     .and(BoolExp.atom(StyleIsDraft))
  // )
  // This will trigger Version creation through Transform
  // and update Style status through StateMachine
});

// UpdateStyleOrder interaction
export const UpdateStyleOrder = Interaction.create({
  name: 'UpdateStyleOrder',
  action: Action.create({ name: 'updateStyleOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleOrders',
        isCollection: true
      })
    ]
  }),
  // Permission: admin or operator
  // userAttributives: boolExpToAttributives(
  //   BoolExp.atom(OperatorOrAdminRole)
  // )
}); 