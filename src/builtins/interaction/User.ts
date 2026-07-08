// User utility functions (not a class)

import { AttributiveInstance, Attributive } from './Attributive.js';
import type { UserRoleType } from '@core';

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
  // CAUTION content 函数需要能通过 toString() 序列化往返，所以这里必须用代码生成而不是闭包捕获。
  //  但 name 不能裸插值进源码（含引号的 name 会语法错误，恶意 name 等于定义期代码注入），
  //  用 JSON.stringify 生成安全转义后的字符串字面量。
  return Attributive.create({
    name,
    content: name ?
      new Function('user', `return !!(user.roles && user.roles.includes(${JSON.stringify(name)}))`) as (user: UserRoleType) => boolean :
      function anyone() { return true },
    isRef
  }, options);
} 