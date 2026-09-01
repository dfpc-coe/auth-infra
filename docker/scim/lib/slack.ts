import { WebClient } from '@slack/web-api';
import { SCIMError } from './scim.js';

export type Channel = {
    id: string;
    name: string;
    is_archived: boolean;
    is_private: boolean;
};

export type SlackConfig = {
    token: string;
    prefix: string;
    privateChannels: boolean;
};

export class Slack {
    client: WebClient;
    config: SlackConfig;
    self?: string;

    constructor(config: SlackConfig) {
        this.config = config;
        this.client = new WebClient(config.token);
    }

    /**
     * Returns the Slack channel name for an Authentik group, or null if the group is not a tak_ group
     */
    channelName(displayName: string): string | null {
        const prefix = this.config.prefix.toLowerCase();
        const name = displayName.trim();
        if (!name.toLowerCase().startsWith(prefix)) return null;

        const stripped = name.slice(prefix.length)
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .slice(0, 80)
            .replace(/^-+|-+$/g, '');

        return stripped.length ? stripped : null;
    }

    async me(): Promise<string> {
        if (this.self) return this.self;
        const res = await this.client.auth.test();
        this.self = String(res.user_id);
        return this.self;
    }

    async userByEmail(email: string): Promise<string | null> {
        try {
            const res = await this.client.users.lookupByEmail({ email: email.trim().toLowerCase() });
            if (res.user && res.user.id && !res.user.deleted) return res.user.id;
            return null;
        } catch (err) {
            if (isSlackError(err, 'users_not_found')) return null;
            throw err;
        }
    }

    async channel(id: string): Promise<Channel | null> {
        try {
            const res = await this.client.conversations.info({ channel: id });
            return res.channel ? toChannel(res.channel) : null;
        } catch (err) {
            if (isSlackError(err, 'channel_not_found')) return null;
            throw err;
        }
    }

    async channelByName(name: string): Promise<Channel | null> {
        let cursor: string | undefined;
        do {
            const res = await this.client.conversations.list({
                types: 'public_channel,private_channel',
                exclude_archived: false,
                limit: 1000,
                cursor
            });

            for (const c of res.channels || []) {
                if (c.name === name) return toChannel(c);
            }

            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);

        return null;
    }

    async ensureChannel(name: string): Promise<Channel> {
        const existing = await this.channelByName(name);

        if (existing) {
            if (existing.is_archived) {
                await this.client.conversations.unarchive({ channel: existing.id });
                existing.is_archived = false;
            }
            return existing;
        }

        try {
            const res = await this.client.conversations.create({
                name,
                is_private: this.config.privateChannels
            });

            if (!res.channel) throw new SCIMError(502, 'Slack did not return a channel');
            return toChannel(res.channel);
        } catch (err) {
            if (isSlackError(err, 'name_taken')) {
                throw new SCIMError(409, `Slack channel #${name} exists but is not accessible to the configured admin user`, 'uniqueness');
            }
            throw err;
        }
    }

    async rename(channel: Channel, name: string): Promise<Channel> {
        if (channel.name === name) return channel;
        const res = await this.client.conversations.rename({ channel: channel.id, name });
        return res.channel ? toChannel(res.channel) : { ...channel, name };
    }

    async archive(id: string): Promise<void> {
        try {
            await this.client.conversations.archive({ channel: id });
        } catch (err) {
            if (!isSlackError(err, 'already_archived', 'channel_not_found', 'cant_archive_general')) throw err;
        }
    }

    async members(id: string): Promise<Set<string>> {
        const members = new Set<string>();
        let cursor: string | undefined;
        do {
            const res = await this.client.conversations.members({ channel: id, limit: 1000, cursor });
            for (const m of res.members || []) members.add(m);
            cursor = res.response_metadata?.next_cursor || undefined;
        } while (cursor);
        return members;
    }

    /**
     * Make channel membership exactly match the given set of Slack user IDs (plus the admin user)
     */
    async setMembers(id: string, desired: Set<string>): Promise<void> {
        const self = await this.me();
        const current = await this.members(id);

        const invite = [...desired].filter((u) => !current.has(u) && u !== self);
        const kick = [...current].filter((u) => !desired.has(u) && u !== self);

        for (let i = 0; i < invite.length; i += 100) {
            const batch = invite.slice(i, i + 100);
            try {
                await this.client.conversations.invite({ channel: id, users: batch.join(',') });
            } catch (err) {
                if (!isSlackError(err, 'already_in_channel', 'cant_invite_self')) throw err;
            }
        }

        for (const user of kick) {
            try {
                await this.client.conversations.kick({ channel: id, user });
            } catch (err) {
                if (!isSlackError(err, 'not_in_channel', 'cant_kick_self', 'cant_kick_from_general')) throw err;
            }
        }
    }

    async addMembers(id: string, users: string[]): Promise<void> {
        const self = await this.me();
        const filtered = users.filter((u) => u !== self);
        if (!filtered.length) return;
        try {
            await this.client.conversations.invite({ channel: id, users: filtered.join(',') });
        } catch (err) {
            if (!isSlackError(err, 'already_in_channel')) throw err;
        }
    }

    async removeMembers(id: string, users: string[]): Promise<void> {
        const self = await this.me();
        for (const user of users) {
            if (user === self) continue;
            try {
                await this.client.conversations.kick({ channel: id, user });
            } catch (err) {
                if (!isSlackError(err, 'not_in_channel', 'cant_kick_from_general')) throw err;
            }
        }
    }
}

function toChannel(c: { id?: string; name?: string; is_archived?: boolean; is_private?: boolean; }): Channel {
    return {
        id: String(c.id),
        name: String(c.name),
        is_archived: Boolean(c.is_archived),
        is_private: Boolean(c.is_private)
    };
}

function isSlackError(err: unknown, ...codes: string[]): boolean {
    const e = err as { data?: { error?: string } };
    return !!e?.data?.error && codes.includes(e.data.error);
}
