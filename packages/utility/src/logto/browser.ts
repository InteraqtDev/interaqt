import LogtoClient from '@logto/browser';

export class Client {
    token?: string
    public client: LogtoClient
    public interactionAddr: string
    constructor(public endpoint: string, public appId: string, public interaqtEndpoint: string) {
        this.interactionAddr = `${this.interaqtEndpoint}/interaction`
        this.client =  new LogtoClient({
            endpoint: this.endpoint,
            appId: this.appId,
            resources:[this.interactionAddr]
        })
    }
    async getToken() {
        this.token =  await this.client.getAccessToken(this.interactionAddr)
    }
    post = async (data:any) => {
        if (!this.token) await this.getToken()

        return (await fetch(this.interactionAddr, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(data)
        })).json()
    }
}
