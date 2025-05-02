import { Interaction } from './interaction';

/**
 * Activity represents higher-level business processes composed of interactions
 */
export type Activity = {
  name: string;
  interactions: Interaction[];
  metadata?: Record<string, any>;
}; 