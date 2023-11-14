import {expectType} from 'tsd';
import { KlassInstance } from "../createClass";
import {Entity} from "../entity/Entity";

expectType<KlassInstance<typeof Entity, true>>(Entity.createReactive({name: 'User'}))
