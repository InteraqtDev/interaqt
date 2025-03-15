import {describe, expect, test} from "vitest";
import {createClass, createInstances, removeAllInstance, stringifyAllInstances} from "../createClass";


const Ref = createClass({
    name: 'Ref',
    public: {
        name: {
            type: 'string',
            required: true,
            collection: false
        }
    }
})

const FuncAndRef = createClass({
    name: 'FuncAndRef',
    public: {
        funcProp: {
            type: 'function',
            required: true,
            collection: false,
            defaultValue: () => function() { return 1; }
        },
        refProp: {
            type: Ref,
            required: true,
            collection: false
        }
    }
})

describe('createClass', () => {
    test('stringifyAllInstances', () => {
        const ref = Ref.create({name: 'ref1'})
        FuncAndRef.create({
            funcProp: function test(){
                return 1
            },
            refProp: ref
        })

        const stringifiedData = stringifyAllInstances();
        const data = JSON.parse(stringifiedData);
        
        removeAllInstance()
        createInstances(data)
        
        expect(FuncAndRef.instances.length).toBe(1)
        expect(typeof FuncAndRef.instances[0].funcProp).toBe('function')
        expect(FuncAndRef.instances[0].refProp.name).toBe('ref1')
        expect(FuncAndRef.instances[0].funcProp()).toBe(1)
    })
})


