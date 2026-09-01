import express from 'express';
import Schema from '@openaddresses/batch-schema';
import serverless from '@tak-ps/serverless-http';
import Config from './lib/config.js';
import auth from './lib/auth.js';
import { SCIMError, CONTENT_TYPE } from './lib/scim.js';

const config = new Config();

export const app = express();

const schema = new Schema(express.Router(), {
    logging: true,
    limit: 5
});

app.disable('x-powered-by');

app.use((req, res, next) => {
    res.type(CONTENT_TYPE);
    next();
});

app.use(auth(config.sharedSecret));
app.use(express.json({ type: ['application/json', CONTENT_TYPE], limit: '1mb' }));
app.use(schema.router);

await schema.load(
    new URL('./routes/', import.meta.url),
    config,
    {
        silent: !!process.env.StackName
    }
);

app.use((req, res) => {
    SCIMError.respond(new SCIMError(404, `${req.method} ${req.path} not found`), res);
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    SCIMError.respond(err, res);
});

export const handler = serverless(app);

if (import.meta.url === `file://${process.argv[1]}`) {
    app.listen(5003, () => {
        console.log('ok - scim server on http://localhost:5003');
    });
}
