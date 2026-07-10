import { Condition } from 'interaqt';

// Attributive 已废弃：角色检查用 Condition 表达（event.user 上的角色数组成员判断）。
export function createRoleCondition(role?: string) {
    return Condition.create({
        name: role || 'anyone',
        content: role
            ? function (this: unknown, event: { user?: { roles?: string[] } }) {
                return !!(event.user?.roles && event.user.roles.includes(role))
            }
            : function anyone() { return true },
    });
}

export const UserRole = createRoleCondition('User')
export const AdminRole = createRoleCondition('Admin')
export const AnonymousRole = createRoleCondition('Anonymous')
