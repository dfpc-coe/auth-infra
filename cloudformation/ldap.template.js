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
            }
        }
    }
);
