import cf from '@openaddresses/cloudfriend';
import LDAP from './lib/ldap.js';

export default cf.merge(
    LDAP,
    {
        Description: 'LDAP Outpost for @tak-ps/auth-infra',
        Parameters: {
            GitSha: {
                Description: 'GitSha that is currently being deployed',
                Type: 'String'
            },
            Environment: {
                Description: 'VPC/ECS Stack to deploy into',
                Type: 'String',
                Default: 'prod'
            },
            EnvType: {
                Description: 'Environment type',
                Type: 'String',
                AllowedValues: ['prod', 'dev-test'],
                Default: 'prod'
            },
            LdapPageSize: {
                Description: 'Users and groups per API page when the outpost rebuilds its snapshot (authentik default 50; the core clamps it to its Maximum page size setting, so raise that first)',
                Type: 'Number',
                Default: 50,
                MinValue: 1
            }
        }
    }
);
