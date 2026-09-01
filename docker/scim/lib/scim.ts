import { Type } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import type { Response } from 'express';

export const SCHEMA_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCHEMA_GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCHEMA_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCHEMA_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCHEMA_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';

export const CONTENT_TYPE = 'application/scim+json';

export class SCIMError extends Error {
    status: number;
    scimType?: string;

    constructor(status: number, message: string, scimType?: string) {
        super(message);
        this.status = status;
        this.scimType = scimType;
    }

    static from(err: unknown): SCIMError {
        if (err instanceof SCIMError) return err;

        const e = err as { data?: { error?: string }; message?: string; status?: number; statusCode?: number };
        if (e?.data?.error) return new SCIMError(502, `Slack error: ${e.data.error}`);

        const status = Number(e?.status || e?.statusCode);
        if (status >= 400 && status < 500) return new SCIMError(status, e.message || 'Bad Request');

        return new SCIMError(500, e?.message || 'Internal Server Error');
    }

    static respond(err: unknown, res: Response) {
        const scim = SCIMError.from(err);
        if (scim.status >= 500) console.error(err);

        res.status(scim.status).type(CONTENT_TYPE).json({
            schemas: [SCHEMA_ERROR],
            status: String(scim.status),
            scimType: scim.scimType,
            detail: scim.message
        });
    }
}

const Meta = (resourceType: string) => Type.Object({
    resourceType: Type.Literal(resourceType),
    location: Type.String()
});

export const Member = Type.Object({
    value: Type.String(),
    display: Type.Optional(Type.String())
});

export const UserInput = Type.Object({
    schemas: Type.Optional(Type.Array(Type.String())),
    externalId: Type.Optional(Type.String()),
    userName: Type.Optional(Type.String()),
    active: Type.Optional(Type.Boolean()),
    emails: Type.Optional(Type.Array(Type.Object({
        value: Type.Optional(Type.String()),
        primary: Type.Optional(Type.Boolean())
    })))
}, { additionalProperties: true });

export const User = Type.Object({
    schemas: Type.Array(Type.String()),
    id: Type.String(),
    externalId: Type.Optional(Type.String()),
    userName: Type.String(),
    active: Type.Boolean(),
    meta: Meta('User')
});

export const GroupInput = Type.Object({
    schemas: Type.Optional(Type.Array(Type.String())),
    externalId: Type.Optional(Type.String()),
    displayName: Type.String(),
    members: Type.Optional(Type.Array(Type.Union([Member, Type.String()])))
}, { additionalProperties: true });

export const Group = Type.Object({
    schemas: Type.Array(Type.String()),
    id: Type.String(),
    externalId: Type.Optional(Type.String()),
    displayName: Type.String(),
    members: Type.Array(Member),
    meta: Meta('Group')
});

export const PatchOp = Type.Object({
    op: Type.String(),
    path: Type.Optional(Type.String()),
    value: Type.Optional(Type.Unknown())
});

export const PatchInput = Type.Object({
    schemas: Type.Array(Type.String()),
    Operations: Type.Array(PatchOp)
}, { additionalProperties: true });

export const Filter = Type.Object({
    filter: Type.Optional(Type.String()),
    startIndex: Type.Optional(Type.Integer()),
    count: Type.Optional(Type.Integer())
});

export const ListResponse = <T extends TSchema>(resource: T) => Type.Object({
    schemas: Type.Array(Type.String()),
    totalResults: Type.Integer(),
    startIndex: Type.Integer(),
    itemsPerPage: Type.Integer(),
    Resources: Type.Array(resource)
});

export type Member = Static<typeof Member>;
export type UserInput = Static<typeof UserInput>;
export type User = Static<typeof User>;
export type GroupInput = Static<typeof GroupInput>;
export type Group = Static<typeof Group>;
export type PatchOp = Static<typeof PatchOp>;
export type PatchInput = Static<typeof PatchInput>;

export function list<T>(resources: T[]) {
    return {
        schemas: [SCHEMA_LIST],
        totalResults: resources.length,
        startIndex: 1,
        itemsPerPage: resources.length,
        Resources: resources
    };
}

/**
 * Parse the subset of SCIM filters Authentik emits: `attr eq "value"`
 */
export function parseEqFilter(filter?: string): { attr: string; value: string } | null {
    if (!filter) return null;
    const match = filter.match(/^\s*([\w.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i);
    if (!match) throw new SCIMError(400, `Unsupported filter: ${filter}`, 'invalidFilter');
    return { attr: match[1].toLowerCase(), value: match[2].replace(/\\(.)/g, '$1') };
}

export function serviceProviderConfig(baseUrl: string) {
    return {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
        documentationUri: 'https://github.com/dfpc-coe/auth-infra',
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{
            type: 'oauthbearertoken',
            name: 'OAuth Bearer Token',
            description: 'Authentication scheme using a shared bearer token',
            primary: true
        }],
        meta: { resourceType: 'ServiceProviderConfig', location: `${baseUrl}/ServiceProviderConfig` }
    };
}

export function resourceTypes(baseUrl: string) {
    return list([{
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        schema: SCHEMA_USER,
        meta: { resourceType: 'ResourceType', location: `${baseUrl}/ResourceTypes/User` }
    }, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        schema: SCHEMA_GROUP,
        meta: { resourceType: 'ResourceType', location: `${baseUrl}/ResourceTypes/Group` }
    }]);
}

export function schemas(baseUrl: string) {
    return list([{
        id: SCHEMA_USER,
        name: 'User',
        description: 'User Account',
        attributes: [
            { name: 'userName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
            { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' }
        ],
        meta: { resourceType: 'Schema', location: `${baseUrl}/Schemas/${SCHEMA_USER}` }
    }, {
        id: SCHEMA_GROUP,
        name: 'Group',
        description: 'Group',
        attributes: [
            { name: 'displayName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
            {
                name: 'members', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default',
                subAttributes: [
                    { name: 'value', type: 'string', multiValued: false, required: true, mutability: 'immutable', returned: 'default' },
                    { name: 'display', type: 'string', multiValued: false, required: false, mutability: 'immutable', returned: 'default' }
                ]
            }
        ],
        meta: { resourceType: 'Schema', location: `${baseUrl}/Schemas/${SCHEMA_GROUP}` }
    }]);
}
