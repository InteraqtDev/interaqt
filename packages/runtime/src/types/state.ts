/**
 * State type representing application-wide or entity-specific states
 */
export type State = {
  name: string;
  type: string;
  typeArguments?: any; // For string length, min/max values, etc.
  value?: any;
  computed?: (...args: any[]) => any;
}; 