import querystring from 'querystring';
import { createRemoteJWKSet, jwtVerify } from "jose";
export const MANAGEMENT_ADDR = 'https://default.logto.app/api';
const extractBearerTokenFromHeaders = ({ authorization }) => {
    const bearerTokenIdentifier = 'Bearer';
    if (!authorization) {
        throw { code: 'auth.authorization_header_missing', status: 401 };
    }
    if (!authorization.startsWith(bearerTokenIdentifier)) {
        throw { code: 'auth.authorization_token_type_not_supported', status: 401 };
    }
    return authorization.slice(bearerTokenIdentifier.length + 1);
};
export class Client {
    constructor(endpoint, appId, appSecret, interaqtEndpoint) {
        this.endpoint = endpoint;
        this.appId = appId;
        this.appSecret = appSecret;
        this.interaqtEndpoint = interaqtEndpoint;
        this.jwks = createRemoteJWKSet(new URL(`${this.endpoint}/oidc/jwks`));
    }
    async getToken() {
        const cred = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
        const resp = await fetch(`${this.endpoint}/oidc/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${cred}`
            },
            body: querystring.stringify({
                "grant_type": "client_credentials",
                "resource": MANAGEMENT_ADDR, // Replace with your API identitfier
                "scope": "all" // Replace with your desired scope(s) if you're using RBAC
            })
        });
        this.token = await resp.json();
    }
    async post(url, data) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify(data)
        });
    }
    async get(url) {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            }
        });
    }
    async getUsers() {
        return (await this.get(`${this.endpoint}/api/users`)).json();
    }
    async verifyJWTForAPI(headers) {
        // Extract the token using the helper function defined above
        const token = extractBearerTokenFromHeaders(headers);
        const { payload } = await jwtVerify(
        // The raw Bearer Token extracted from the request header
        token, this.jwks, {
            // Expected issuer of the token, issued by the Logto server
            issuer: `${this.endpoint}/oidc`,
            // Expected audience token, the resource indicator of the current API
            audience: `${this.interaqtEndpoint}/interaction`,
        });
        return payload;
    }
}
//# sourceMappingURL=server.js.map