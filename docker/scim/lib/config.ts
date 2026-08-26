import { Slack } from './slack.js';

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} env var must be provided`);
    return value;
}

export default class Config {
    sharedSecret: string;
    baseUrl: string;
    prefix: string;
    privateChannels: boolean;
    slack: Slack;

    constructor() {
        this.sharedSecret = required('SCIM_SHARED_SECRET');
        this.baseUrl = (process.env.SCIM_BASE_URL || 'http://localhost:5003').replace(/\/+$/, '');
        this.prefix = process.env.SLACK_GROUP_PREFIX || 'tak_';
        this.privateChannels = process.env.SLACK_PRIVATE_CHANNELS === 'true';

        this.slack = new Slack({
            token: required('SLACK_USER_TOKEN'),
            prefix: this.prefix,
            privateChannels: this.privateChannels
        });
    }
}
