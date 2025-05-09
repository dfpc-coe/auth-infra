import cf from '@openaddresses/cloudfriend';
import API from './lib/api.js';
import KMS from './lib/kms.js';
import EFS from './lib/efs.js';
import { ELB as ELBAlarms } from '@openaddresses/batch-alarms';

export default cf.merge(
    API,
    KMS,
    EFS,
    {
        Description: 'Template for @tak-ps/auth-infra',
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
            AlarmEmail: {
                Description: 'Email to send alarms to',
                Type: 'String'
            }
        }
    },
    ELBAlarms({
        prefix: 'AuthELB',
        loadbalancer: cf.getAtt('ELB', 'LoadBalancerFullName'),
        targetgroup: cf.getAtt('TargetGroup', 'TargetGroupFullName')

    })
);
