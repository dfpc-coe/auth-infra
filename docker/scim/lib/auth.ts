import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { SCIMError } from './scim.js';

export default function auth(sharedSecret: string) {
    const expected = Buffer.from(sharedSecret);

    return (req: Request, res: Response, next: NextFunction) => {
        const match = (req.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
        const token = Buffer.from(match ? match[1] : '');

        if (!match || token.length !== expected.length || !timingSafeEqual(token, expected)) {
            return SCIMError.respond(new SCIMError(401, 'Unauthorized'), res);
        }

        return next();
    };
}
