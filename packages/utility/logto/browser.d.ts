import LogtoClient from '@logto/browser';
export declare class Client {
    endpoint: string;
    appId: string;
    api_addr: string;
    token?: string;
    client: LogtoClient;
    constructor(endpoint: string, appId: string, api_addr: string);
    getToken(): Promise<void>;
    post: (data: any) => Promise<any>;
}
//# sourceMappingURL=browser.d.ts.map