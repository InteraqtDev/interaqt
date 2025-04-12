/**
 * Attributive type for providing additional context or qualifiers for operations
 */
export type Attributive = {
  name: string;
  content: any;
  isRef?: boolean;
};

/**
 * Collection of attributives
 */
export type Attributives = Attributive[]; 