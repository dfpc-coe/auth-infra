import cf from '@openaddresses/cloudfriend';
import API from './lib/api.js';
import KMS from './lib/kms.js';
import { ELB as ELBAlarms } from '@openaddresses/batch-alarms';

export default cf.merge(
    API,
    KMS,
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
        email: cf.ref('AlarmEmail'),
        apache: cf.stackName,
        cluster: cf.join(['coe-ecs-', cf.ref('Environment')]),
        service: cf.getAtt('Service', 'Name'),
        loadbalancer: cf.getAtt('ELB', 'LoadBalancerFullName'),
        targetgroup: cf.getAtt('TargetGroup', 'TargetGroupFullName')

    })
);
