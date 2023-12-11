import {createUserRoleAttributive, Attributive} from "@interaqt/runtime";

export const NewAttr = Attributive.create({
    name: 'New',
    content: function New(){}
})

export const New2Attr = Attributive.create({
    name: 'New2',
    content: function New2(){}
})

export const New3Attr = Attributive.create({
    name: 'New3',
    content: function New3(){}
})


export const OldAttr = Attributive.create({
    name: 'Old',
    content: function Old(){}
})

export const Old2Attr = Attributive.create({
    name: 'Old2',
    content: function Old2(){}
})

export const Old3Attr = Attributive.create({
    name: 'Old3',
    content: function Old3(){}
})

export const OtherAttr = Attributive.create({
    name: 'Other',
    content: 
function Other(targetUser, { user }){ 
    return user.id !== targetUser.id 
}

    // content: `function Other(){}`
})

export const User = createUserRoleAttributive( {
    name: 'User'
}, { isReactive: true })

export const Admin = createUserRoleAttributive( {
    name: 'Admin'
}, { isReactive: true })

export const Anonymous = createUserRoleAttributive( {
    name: 'Anonymous'
}, { isReactive: true })

