/**
 * Unify combines multiple types into a single abstract type
 */
export type Unify<T extends any[]> = T[number];

/**
 * Filter creates specialized types from more general ones
 */
export type Filter<T, F> = T extends F ? T : never; 