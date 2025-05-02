export const service = createService('http://localhost:3000/api')

type ServiceType = {
    [k: string]: (...argv: any[]) => Promise<any>
}

export function createService(baseURL: string) : ServiceType{
    return new Proxy({}, {
        get(target, key) {
            if (typeof key !== "string") return undefined

            return function(...args: any[]) {
                return fetch(baseURL, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ method: key, argv: args})})
            }
        }
    })
}