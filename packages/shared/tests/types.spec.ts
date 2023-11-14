import {assertType, describe, test} from "vitest";
import {Activity, ActivityInstanceType} from "../activity/Activity";


type ClassPropType = {
    // defaultValue?: () => any,
    // required?: false,
}

type DefaultValueType = () => any

// type GenRequiredType<T> = Omit<T, 'required'> & { required: true}
type OptionalRequiredType<T> = T&{required?:false} | T& { required: true}
type OptionalDefaultValueType<T> = T&{defaultValue?: undefined} | T& { defaultValue: DefaultValueType}
// type ClassMetaPublicItem = ClassPropType | ClassCollectionPropType| ClassRequiredPropType | ClassRequiredCollectionPropType
// type ClassMetaPublicItem = ClassPropType | GenRequiredType<ClassPropType>
type ClassMetaPublicItem = OptionalDefaultValueType<OptionalRequiredType<ClassPropType>>


// type RequireWithoutDefault<T extends ClassMetaPublicItem> =  T["required"] extends true ? T["defaultValue"] extends never ? true : false : false
type RequireWithoutDefault<T extends ClassMetaPublicItem> =  T["required"] extends true ? true: false

const a: ClassMetaPublicItem  = {
    required: true,
}

type Ta1 = typeof a
type ShouldBeUndefined = Ta1["defaultValue"]

type ShouldTree = RequireWithoutDefault<typeof a>



type A = {
    b: B
}

type B = {
   c: C
}
type C= {
    a: A
}


const acitivity :ActivityInstanceType= Activity.create({
    name: 'Activit1111y',
})



describe("test", () => {
  test('types', () => {
      assertType<ShouldTree>(true)
      assertType<undefined>(a.defaultValue as ShouldBeUndefined)
    assertType<any>(acitivity.interactions)

  })
})


