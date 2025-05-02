/**
 * Intent type expressing the semantic meaning within an Interaction
 */
export enum IntentType {
  Get = 'Get',
  Update = 'Update',
  Delete = 'Delete',
  Create = 'Create'
}

export type Intent = {
  type: IntentType;
}; 