import LogtoClient from '@logto/browser';
export declare class Client {
    endpoint: string;
    appId: string;
    interaqtEndpoint: string;
    token?: string;
    client: LogtoClient;
    interactionAddr: string;
    constructor(endpoint: string, appId: string, interaqtEndpoint: string);
    getToken(): Promise<void>;
    post: (data: any, devUserId?: any) => Promise<any>;
}
//# sourceMappingURL=browser.d.ts.map