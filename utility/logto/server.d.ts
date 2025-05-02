/// <reference types="node" />
import { createRemoteJWKSet } from "jose";
import { IncomingHttpHeaders } from "http";
export declare const MANAGEMENT_ADDR = "https://default.logto.app/api";
export declare class Client {
    endpoint: string;
    appId: string;
    appSecret: string;
    interaqtEndpoint: string;
    jwks: ReturnType<typeof createRemoteJWKSet>;
    constructor(endpoint: string, appId: string, appSecret: string, interaqtEndpoint: string);
    token: any;
    getToken(): Promise<void>;
    post(url: string, data: any): Promise<Response>;
    get(url: string): Promise<Response>;
    getUsers(): Promise<any>;
    verifyJWTForAPI(headers: IncomingHttpHeaders): Promise<import("jose").JWTPayload>;
}
//# sourceMappingURL=server.d.ts.map