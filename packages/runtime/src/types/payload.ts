import { Attributive } from './attributive';

/**
 * PayloadItem defines a single item within a payload
 */
export type PayloadItem = {
  name: string;
  attributives?: Attributive[];
  type: any;
  isRequired?: boolean;
  isRef?: boolean;
  isCollection?: boolean;
  itemRef?: string;
};

/**
 * Payload contains a collection of PayloadItems
 */
export type Payload = {
  items: PayloadItem[];
}; 