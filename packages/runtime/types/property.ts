/**
 * Property type for defining entity and relation structures
 */
export type Property = {
  name: string;
  type: string;
  isCollection?: boolean;
  isRequired?: boolean;
  defaultValue?: any;
  computed?: (...args: any[]) => any;
}; 