import {createUserRoleAttributive, UserAttributive} from "@interaqt/shared";

export const NewAttr = UserAttributive.createReactive({
    name: 'New',
    content: function New(){}
})

export const New2Attr = UserAttributive.createReactive({
    name: 'New2',
    content: function New2(){}
})

export const New3Attr = UserAttributive.createReactive({
    name: 'New3',
    content: function New3(){}
})


export const OldAttr = UserAttributive.createReactive({
    name: 'Old',
    content: function Old(){}
})

export const Old2Attr = UserAttributive.createReactive({
    name: 'Old2',
    content: function Old2(){}
})

export const Old3Attr = UserAttributive.createReactive({
    name: 'Old3',
    content: function Old3(){}
})

export const OtherAttr = UserAttributive.createReactive({
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

