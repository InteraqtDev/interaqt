import { KlassByName, registerKlass } from './utils.js';
import { Entity } from './Entity.js';
import { Relation } from './Relation.js';
import { Property } from './Property.js';
import { StateNode } from './StateNode.js';
import { StateTransfer } from './StateTransfer.js';
import { StateMachine } from './StateMachine.js';
import { WeightedSummation } from './WeightedSummation.js';
import { Count } from './Count.js';
import { Summation } from './Summation.js';
import { Average } from './Average.js';
import { Every } from './Every.js';
import { Any } from './Any.js';
import { Transform } from './Transform.js';
import { RealTime } from './RealTime.js';
import { SideEffect } from './SideEffect.js';
import { Dictionary } from './RealDictionary.js';
import { BoolAtomData, BoolExpressionData } from './BoolExp.js';

const klassesToRegister = [
  Entity,
  Relation,
  Property,
  StateNode,
  StateTransfer,
  StateMachine,
  WeightedSummation,
  Count,
  Summation,
  Average,
  Every,
  Any,
  Transform,
  RealTime,
  SideEffect,
  Dictionary,
  BoolAtomData,
  BoolExpressionData,
];

klassesToRegister.forEach(klass => {
  if (klass && klass.displayName) {
    registerKlass(klass.displayName, klass);
  }
});

export { KlassByName }; 