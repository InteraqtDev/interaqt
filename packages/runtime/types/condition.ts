/**
 * Condition type for controlling permissions in Interactions
 */
export type Condition = {
  name: string;
  content: any; // Boolean expression
};

/**
 * Operator types for condition expressions
 */
export enum ConditionOperator {
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT'
}

/**
 * Boolean expression composed of Condition elements
 */
export type BooleanExpression = {
  operator: ConditionOperator;
  operands: Array<Condition | BooleanExpression>;
};

/**
 * Conditions for interactions
 */
export type Conditions = BooleanExpression | Condition; 