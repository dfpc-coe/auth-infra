import { SCIMError, SCHEMA_USER } from './scim.js';
import type { User, UserInput } from './scim.js';

/**
 * Users are stateless: the SCIM id is the base64url encoded email (userName).
 * Slack membership is resolved by email at group sync time.
 */
export default class UserStore {
    baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    static idFromEmail(email: string): string {
        return Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url');
    }

    static emailFromId(id: string): string {
        if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new SCIMError(404, `User ${id} not found`);
        const email = Buffer.from(id, 'base64url').toString('utf8');
        if (!email.includes('@')) throw new SCIMError(404, `User ${id} not found`);
        return email;
    }

    get(id: string): User {
        return this.user(id, UserStore.emailFromId(id));
    }

    find(filter: { attr: string; value: string } | null): User[] {
        if (!filter) return [];
        if (filter.attr !== 'username' && filter.attr !== 'emails.value') return [];
        if (!filter.value.includes('@')) return [];
        return [this.user(UserStore.idFromEmail(filter.value), filter.value)];
    }

    create(input: UserInput): User {
        const email = UserStore.email(input);
        return this.user(UserStore.idFromEmail(email), input.userName || email, input);
    }

    /**
     * Ids stay stable across email changes so Authentik never loses the link
     */
    replace(id: string, input: UserInput): User {
        UserStore.emailFromId(id);
        return this.user(id, input.userName || UserStore.email(input), input);
    }

    private static email(input: UserInput): string {
        const emails = input.emails || [];
        const primary = emails.find((e) => e.primary && e.value) || emails.find((e) => e.value);
        const email = input.userName && input.userName.includes('@') ? input.userName : primary?.value;

        if (!email) throw new SCIMError(400, 'An email address is required', 'invalidValue');
        return email;
    }

    private user(id: string, userName: string, input: UserInput = {}): User {
        return {
            schemas: [SCHEMA_USER],
            id,
            externalId: input.externalId,
            userName,
            active: input.active === undefined ? true : input.active,
            meta: { resourceType: 'User', location: `${this.baseUrl}/Users/${id}` }
        };
    }
}
