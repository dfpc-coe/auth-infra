import cf from '@openaddresses/cloudfriend';
import API from './lib/api.js';
import DB from './lib/db.js';
import KMS from './lib/kms.js';
import EFS from './lib/efs.js';
import REDIS from './lib/redis.js';
import { ELB as ELBAlarms } from '@openaddresses/batch-alarms';

export default cf.merge(
    API,
    DB,
    KMS,
    EFS,
    REDIS,
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
            EnvType: {
                Description: 'Environment type',
                Type: 'String',
                AllowedValues: ['prod', 'dev-test'],
                Default: 'prod'
            }
        },
        Resources: {
            ApplicationAssociation: {
                Type: 'AWS::ServiceCatalogAppRegistry::ResourceAssociation',
                Properties: {
                    Application: cf.join(['arn:', cf.partition, ':servicecatalog:', cf.region, ':', cf.accountId, ':/applications/', cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-application']))]),
                    Resource: cf.stackId,
                    ResourceType: 'CFN_STACK'
                }
            }
        }
    },
    ELBAlarms({
        prefix: 'AuthALB',
        loadbalancer: cf.getAtt('ALB', 'LoadBalancerFullName'),
        targetgroup: cf.getAtt('TargetGroup', 'TargetGroupFullName')
    })
);
