import LogtoClient from '@logto/browser';
export class Client {
    constructor(endpoint, appId, interaqtEndpoint) {
        this.endpoint = endpoint;
        this.appId = appId;
        this.interaqtEndpoint = interaqtEndpoint;
        this.post = async (data) => {
            if (!this.token)
                await this.getToken();
            return (await fetch(this.interactionAddr, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(data)
            })).json();
        };
        this.interactionAddr = `${this.interaqtEndpoint}/interaction`;
        this.client = new LogtoClient({
            endpoint: this.endpoint,
            appId: this.appId,
            resources: [this.interactionAddr]
        });
    }
    async getToken() {
        this.token = await this.client.getAccessToken(this.interactionAddr);
    }
}
//# sourceMappingURL=browser.js.map