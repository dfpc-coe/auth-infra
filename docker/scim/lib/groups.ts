import { SCIMError, SCHEMA_GROUP } from './scim.js';
import type { Group, GroupInput, Member, PatchOp } from './scim.js';
import { Slack } from './slack.js';
import type { Channel } from './slack.js';
import UserStore from './users.js';

const IGNORED = 'ignored-';

type Resolved = { slackIds: string[]; members: Member[] };

/**
 * Maps SCIM groups onto Slack channels. Groups matching the configured prefix
 * use the Slack channel id as their SCIM id; all other groups are acknowledged
 * with a synthetic `ignored-` id and never touch Slack.
 *
 * One instance per request: the email lookup cache is scoped to its lifetime.
 */
export default class GroupSync {
    slack: Slack;
    baseUrl: string;
    private emails = new Map<string, string | null>();

    constructor(slack: Slack, baseUrl: string) {
        this.slack = slack;
        this.baseUrl = baseUrl;
    }

    async get(id: string): Promise<Group> {
        if (GroupSync.isIgnored(id)) return this.group(id, GroupSync.ignoredName(id));

        const channel = await this.channel(id);
        return this.group(channel.id, this.slack.config.prefix + channel.name);
    }

    async find(filter: { attr: string; value: string } | null): Promise<Group[]> {
        if (!filter || filter.attr !== 'displayname') return [];

        const name = this.slack.channelName(filter.value);
        if (!name) return [this.group(GroupSync.ignoredId(filter.value), filter.value)];

        const channel = await this.slack.channelByName(name);
        if (!channel || channel.is_archived) return [];

        return [this.group(channel.id, filter.value)];
    }

    async create(input: GroupInput): Promise<Group> {
        const name = this.slack.channelName(input.displayName);
        if (!name) {
            console.log(`ok - group "${input.displayName}" does not match prefix, ignoring`);
            return this.group(GroupSync.ignoredId(input.displayName), input.displayName, [], input.externalId);
        }

        const channel = await this.slack.ensureChannel(name);
        return this.sync(channel, input);
    }

    async replace(id: string, input: GroupInput): Promise<Group> {
        if (GroupSync.isIgnored(id)) return this.create(input);

        const name = this.slack.channelName(input.displayName);
        if (!name) {
            await this.slack.archive(id);
            return this.group(GroupSync.ignoredId(input.displayName), input.displayName, [], input.externalId);
        }

        const channel = await this.slack.rename(await this.channel(id), name);
        return this.sync(channel, input);
    }

    async patch(id: string, ops: PatchOp[]): Promise<Group> {
        if (GroupSync.isIgnored(id)) return this.group(id, GroupSync.ignoredName(id));

        const channel = await this.channel(id);
        let displayName = this.slack.config.prefix + channel.name;

        for (const op of ops) {
            const kind = op.op.toLowerCase();
            const path = (op.path || '').toLowerCase();
            const value = op.value as Record<string, unknown> | undefined;

            if (kind === 'replace' && GroupSync.targets(path, value, 'displayname')) {
                displayName = String(path ? op.value : value?.displayName);
                await this.rename(channel, displayName);
            } else if (kind === 'replace' && GroupSync.targets(path, value, 'members')) {
                const { slackIds } = await this.resolve(GroupSync.values(path ? op.value : value?.members));
                await this.slack.setMembers(channel.id, new Set(slackIds));
            } else if (kind === 'add' && path === 'members') {
                const { slackIds } = await this.resolve(GroupSync.values(op.value));
                await this.slack.addMembers(channel.id, slackIds);
            } else if (kind === 'remove' && path === 'members') {
                const { slackIds } = await this.resolve(GroupSync.values(op.value));
                await this.slack.removeMembers(channel.id, slackIds);
            } else if (kind === 'remove' && path.startsWith('members[')) {
                const match = (op.path || '').match(/value\s+eq\s+"([^"]+)"/i);
                if (!match) throw new SCIMError(400, `Unsupported path: ${op.path}`, 'invalidPath');
                const { slackIds } = await this.resolve([match[1]]);
                await this.slack.removeMembers(channel.id, slackIds);
            } else {
                throw new SCIMError(400, `Unsupported patch op: ${op.op} ${op.path || ''}`, 'invalidPath');
            }
        }

        return this.group(channel.id, displayName);
    }

    async remove(id: string): Promise<void> {
        if (GroupSync.isIgnored(id)) return;
        await this.slack.archive(id);
        console.log(`ok - archived ${id}`);
    }

    private async channel(id: string): Promise<Channel> {
        const channel = await this.slack.channel(id);
        if (!channel || channel.is_archived) throw new SCIMError(404, `Group ${id} not found`);
        return channel;
    }

    private async rename(channel: Channel, displayName: string): Promise<void> {
        const name = this.slack.channelName(displayName);
        if (!name) throw new SCIMError(400, 'Cannot rename group outside the managed prefix via PATCH', 'invalidValue');
        await this.slack.rename(channel, name);
    }

    private async sync(channel: Channel, input: GroupInput): Promise<Group> {
        const { slackIds, members } = await this.resolve(GroupSync.values(input.members));
        await this.slack.setMembers(channel.id, new Set(slackIds));

        console.log(`ok - synced #${channel.name} (${channel.id}) with ${slackIds.length} members`);
        return this.group(channel.id, input.displayName, members, input.externalId);
    }

    private async resolve(scimIds: string[]): Promise<Resolved> {
        const slackIds = new Set<string>();
        const members: Member[] = [];

        for (const scimId of scimIds) {
            let email: string;
            try {
                email = UserStore.emailFromId(scimId);
            } catch {
                continue;
            }

            members.push({ value: scimId, display: email });

            if (!this.emails.has(email)) this.emails.set(email, await this.slack.userByEmail(email));

            const slackId = this.emails.get(email);
            if (slackId) slackIds.add(slackId);
            else console.log(`ok - no slack user for ${email}, skipping`);
        }

        return { slackIds: [...slackIds], members };
    }

    private group(id: string, displayName: string, members: Member[] = [], externalId?: string): Group {
        return {
            schemas: [SCHEMA_GROUP],
            id,
            externalId,
            displayName,
            members,
            meta: { resourceType: 'Group', location: `${this.baseUrl}/Groups/${id}` }
        };
    }

    private static targets(path: string, value: Record<string, unknown> | undefined, attr: string): boolean {
        if (path) return path === attr;
        if (!value || typeof value !== 'object') return false;
        return (attr === 'displayname' ? 'displayName' : attr) in value;
    }

    private static values(members: unknown): string[] {
        if (!Array.isArray(members)) return [];
        return members
            .map((m) => (typeof m === 'string' ? m : (m as Member)?.value))
            .filter((v): v is string => typeof v === 'string' && v.length > 0);
    }

    private static ignoredId(displayName: string): string {
        return IGNORED + Buffer.from(displayName, 'utf8').toString('base64url');
    }

    private static isIgnored(id: string): boolean {
        return id.startsWith(IGNORED);
    }

    private static ignoredName(id: string): string {
        return Buffer.from(id.slice(IGNORED.length), 'base64url').toString('utf8');
    }
}
