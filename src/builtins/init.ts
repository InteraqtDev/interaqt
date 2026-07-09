import { registerKlass } from '@core';
import { Interaction } from './interaction/Interaction.js';
import { Activity, ActivityGroup, Transfer } from './interaction/Activity.js';
import { Attributive, Attributives } from './interaction/Attributive.js';
import { Condition } from './interaction/Condition.js';
import { DataPolicy } from './interaction/Data.js';
import { Action } from './interaction/Action.js';
import { Gateway } from './interaction/Gateway.js';
import { Event } from './interaction/Event.js';
import { PayloadItem } from './interaction/PayloadItem.js';
import { Payload } from './interaction/Payload.js';
import { Conditions } from './interaction/Conditions.js';

const klassesToRegister = [
  Interaction,
  Activity,
  // CAUTION Transfer/ActivityGroup/Attributives 必须注册：
  //  Activity.stringify 把 transfers/groups 编码为 `uuid::` 引用，
  //  未注册的类型在 createInstancesFromString（graph 级反序列化）中无法还原。
  ActivityGroup,
  Transfer,
  Attributive,
  Attributives,
  Condition,
  DataPolicy,
  Action,
  Gateway,
  Event,
  PayloadItem,
  Payload,
  Conditions,
];

klassesToRegister.forEach(klass => {
  if (klass && klass.displayName) {
    registerKlass(klass.displayName, klass);
  }
});
