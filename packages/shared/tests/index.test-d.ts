import {expectType} from 'tsd';
import { KlassInstanceOf } from "../createClass";
import {Entity} from "../entity/Entity";

expectType<KlassInstanceOf<typeof Entity, true>>(Entity.createReactive({name: 'User'}))
