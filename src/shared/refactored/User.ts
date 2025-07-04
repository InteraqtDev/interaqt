// User utility functions (not a class)

import { AttributiveInstance, Attributive } from './Attributive.js';
import type { IInstance } from './interfaces.js';
import type { UserRoleType } from './types.js';

export interface UserRoleAttributiveOptions {
  name?: string;
  isRef?: boolean;
}

export interface AttributiveCreateOptions {
  uuid?: string;
}

export function createUserRoleAttributive(
  { name, isRef = false }: UserRoleAttributiveOptions, 
  options?: AttributiveCreateOptions
): AttributiveInstance {
  return Attributive.create({
    name,
    content: name ?
      new Function('user', `return user.roles.includes('${name}')`) as (user: UserRoleType) => boolean :
      function anyone() { return true },
    isRef
  }, options);
} 