import { Action, Scheduler } from './action';
import { Attributive } from './attributive';
import { Conditions } from './condition';
import { Intent } from './intent';
import { Payload } from './payload';

/**
 * Interaction represents operations that can be performed within the system
 */
export type Interaction = {
  name: string;
  conditions?: Conditions;
  userAttributes?: Record<string, any>;
  userRef?: string;
  intent: Intent;
  payload?: Payload;
  action?: Action | Scheduler;
  
  // For non-Get interactions with data retrieval needs
  dataAttributive?: Attributive[];
  dataType?: any;
  dataQuery?: any;
}; 