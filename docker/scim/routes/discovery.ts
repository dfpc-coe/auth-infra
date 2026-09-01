import Schema from '@openaddresses/batch-schema';
import { Type } from '@sinclair/typebox';
import Config from '../lib/config.js';
import { serviceProviderConfig, resourceTypes, schemas } from '../lib/scim.js';

export default async function router(schema: Schema, config: Config) {
    schema.get('/ServiceProviderConfig', {
        name: 'Service Provider Config',
        group: 'Discovery',
        description: 'SCIM capabilities supported by this endpoint',
        res: Type.Any()
    }, (req, res) => {
        res.json(serviceProviderConfig(config.baseUrl));
    });

    schema.get('/ResourceTypes', {
        name: 'Resource Types',
        group: 'Discovery',
        description: 'SCIM resource types supported by this endpoint',
        res: Type.Any()
    }, (req, res) => {
        res.json(resourceTypes(config.baseUrl));
    });

    schema.get('/Schemas', {
        name: 'Schemas',
        group: 'Discovery',
        description: 'SCIM schemas supported by this endpoint',
        res: Type.Any()
    }, (req, res) => {
        res.json(schemas(config.baseUrl));
    });
}
