import Schema from '@openaddresses/batch-schema';
import { Type } from '@sinclair/typebox';
import Config from '../lib/config.js';
import UserStore from '../lib/users.js';
import { SCIMError, CONTENT_TYPE, User, UserInput, Filter, ListResponse, list, parseEqFilter } from '../lib/scim.js';

const Params = Type.Object({ id: Type.String() });

export default async function router(schema: Schema, config: Config) {
    const users = new UserStore(config.baseUrl);

    schema.get('/Users', {
        name: 'List Users',
        group: 'Users',
        description: 'Filter users by userName',
        query: Filter,
        res: ListResponse(User)
    }, (req, res) => {
        try {
            res.json(list(users.find(parseEqFilter(req.query.filter))));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.get('/Users/:id', {
        name: 'Get User',
        group: 'Users',
        description: 'Get a single user',
        params: Params,
        res: User
    }, (req, res) => {
        try {
            res.json(users.get(req.params.id));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.post('/Users', {
        name: 'Create User',
        group: 'Users',
        description: 'Create a user',
        body: { [CONTENT_TYPE]: UserInput, 'application/json': UserInput },
        res: User
    }, (req, res) => {
        try {
            res.status(201).json(users.create(req.body as UserInput));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.put('/Users/:id', {
        name: 'Replace User',
        group: 'Users',
        description: 'Replace a user',
        params: Params,
        body: { [CONTENT_TYPE]: UserInput, 'application/json': UserInput },
        res: User
    }, (req, res) => {
        try {
            res.json(users.replace(req.params.id, req.body as UserInput));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.patch('/Users/:id', {
        name: 'Patch User',
        group: 'Users',
        description: 'Users carry no state; the patch is acknowledged and the current identity echoed',
        params: Params,
        body: { [CONTENT_TYPE]: true, 'application/json': true },
        res: User
    }, (req, res) => {
        try {
            res.json(users.get(req.params.id));
        } catch (err) {
            SCIMError.respond(err, res);
        }
    });

    schema.delete('/Users/:id', {
        name: 'Delete User',
        group: 'Users',
        description: 'Delete a user',
        params: Params,
        res: Type.Any()
    }, (req, res) => {
        res.status(204).end();
    });
}
