import { registerKlass } from '@core';
import { Interaction } from './interaction/Interaction.js';
import { Activity } from './interaction/Activity.js';
import { Attributive } from './interaction/Attributive.js';
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
  Attributive,
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
