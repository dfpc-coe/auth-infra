import cf from '@openaddresses/cloudfriend';
import API from './lib/api.js';
import { ELB as ELBAlarms } from '@openaddresses/batch-alarms';

export default cf.merge(
    API,
    {
        Description: 'Template for @tak-ps/auth-infra',
        Parameters: {
            GitSha: {
                Description: 'GitSha that is currently being deployed',
                Type: 'String'
            },
            NetworkName: {
                Description: 'VPC Stack to deploy into (Created by tak-ps/vpc)',
                Type: 'String',
                Default: 'coe-vpc-prod'
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
        cluster: cf.ref('ECSCluster'),
        service: cf.getAtt('Service', 'Name'),
        loadbalancer: cf.getAtt('ELB', 'LoadBalancerFullName'),
        targetgroup: cf.getAtt('TargetGroup', 'TargetGroupFullName')

    })
);
