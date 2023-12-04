import {createUserRoleAttributive, UserAttributive} from "@interaqt/shared";

export const OtherAttr = UserAttributive.create({
    name: 'Other',
    content:
function Other(targetUser, { user }){ 
    return user.id !== targetUser.id 
}
})

export const Admin = createUserRoleAttributive( {
    name: 'Admin'
})

export const Anonymous = createUserRoleAttributive( {
    name: 'Anonymous'
})

export const globalUserRole = createUserRoleAttributive({} )
