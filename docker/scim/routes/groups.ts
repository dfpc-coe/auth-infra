import Schema from '@openaddresses/batch-schema';
import { Type } from '@sinclair/typebox';
import Config from '../lib/config.js';
import GroupSync from '../lib/groups.js';
import { SCIMError, SCHEMA_PATCH, CONTENT_TYPE, Group, GroupInput, PatchInput, Filter, ListResponse, list, parseEqFilter } from '../lib/scim.js';

const Params = Type.Object({ id: Type.String() });

export default async function router(schema: Schema, config: Config) {
    const groups = () => new GroupSync(config.slack, config.baseUrl);

    schema.get('/Groups', {
        name: 'List Groups',
        group: 'Groups',
        description: 'Filter groups by displayName',
        query: Filter,
        res: ListResponse(Group)
    }, async (req, res) => {
        try {
            res.json(list(await groups().find(parseEqFilter(req.query.filter))));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.get('/Groups/:id', {
        name: 'Get Group',
        group: 'Groups',
        description: 'Get a single group',
        params: Params,
        res: Group
    }, async (req, res) => {
        try {
            res.json(await groups().get(req.params.id));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.post('/Groups', {
        name: 'Create Group',
        group: 'Groups',
        description: 'Create a group and its Slack channel',
        body: { [CONTENT_TYPE]: GroupInput, 'application/json': GroupInput },
        res: Group
    }, async (req, res) => {
        try {
            res.status(201).json(await groups().create(req.body as GroupInput));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.put('/Groups/:id', {
        name: 'Replace Group',
        group: 'Groups',
        description: 'Replace a group, syncing channel name and membership',
        params: Params,
        body: { [CONTENT_TYPE]: GroupInput, 'application/json': GroupInput },
        res: Group
    }, async (req, res) => {
        try {
            res.json(await groups().replace(req.params.id, req.body as GroupInput));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.patch('/Groups/:id', {
        name: 'Patch Group',
        group: 'Groups',
        description: 'Apply SCIM PatchOp operations to a group',
        params: Params,
        body: { [CONTENT_TYPE]: PatchInput, 'application/json': PatchInput },
        res: Group
    }, async (req, res) => {
        try {
            const body = req.body as PatchInput;
            if (!body.schemas.includes(SCHEMA_PATCH)) throw new SCIMError(400, 'Expected PatchOp schema', 'invalidSyntax');
            res.json(await groups().patch(req.params.id, body.Operations));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.delete('/Groups/:id', {
        name: 'Delete Group',
        group: 'Groups',
        description: 'Delete a group, archiving its Slack channel',
        params: Params,
        res: Type.Any()
    }, async (req, res) => {
        try {
            await groups().remove(req.params.id);
            res.status(204).end();
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });
}
