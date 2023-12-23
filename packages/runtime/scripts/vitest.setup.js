import crypto from 'node:crypto';
if (globalThis && !globalThis.crypto) {
    globalThis.crypto = crypto;
}