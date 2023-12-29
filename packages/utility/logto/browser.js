import LogtoClient from '@logto/browser';
export class Client {
    constructor(endpoint, appId, api_addr) {
        this.endpoint = endpoint;
        this.appId = appId;
        this.api_addr = api_addr;
        this.post = async (data) => {
            if (!this.token)
                await this.getToken();
            return (await fetch(`${this.api_addr}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(data)
            })).json();
        };
        this.client = new LogtoClient({
            endpoint: this.endpoint,
            appId: this.appId,
            resources: [this.api_addr]
        });
    }
    async getToken() {
        this.token = await this.client.getAccessToken(this.api_addr);
    }
}
//# sourceMappingURL=browser.js.map