import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        LDAPDNS: {
            Type: 'AWS::Route53::RecordSet',
            Properties: {
                HostedZoneId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-hosted-zone-id'])),
                Type : 'A',
                Name: cf.join(['ldap.', cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-hosted-zone-name']))]),
                Comment: cf.join(' ', [cf.stackName, 'Internal LDAP DNS Entry']),
                AliasTarget: {
                    DNSName: cf.getAtt('NLB', 'DNSName'),
                    EvaluateTargetHealth: true,
                    HostedZoneId: cf.getAtt('NLB', 'CanonicalHostedZoneID')
                }
            }
        },
        NLB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'network',
                Scheme: 'internal',
                SecurityGroups: [cf.ref('NLBSecurityGroup')],
                Subnets:  [
                    cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                    cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                ]
            }

        },
        NLBSecurityGroup: {
            Type : 'AWS::EC2::SecurityGroup',
            Properties : {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'nlb-sg-ldap'])
                }],
                GroupDescription: 'Allow 636 Access to NLB',
                SecurityGroupIngress: [{
                    CidrIp: '10.0.0.0/8',
                    IpProtocol: 'tcp',
                    FromPort: 636,
                    ToPort: 636
                }],
                VpcId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc']))
            }
        },
        LDAPSListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                Certificates: [{
                    CertificateArn: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-acm']))
                }],
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('OutpostTargetGroup3389')
                }],
                LoadBalancerArn: cf.ref('NLB'),
                Port: 636,
                Protocol: 'TLS'
            }
        },
        OutpostTargetGroup3389: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: 'NLB',
            Properties: {
                Port: 3389,
                Protocol: 'TCP',
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc'])),

                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckPort: 3389,
                HealthCheckProtocol: 'TCP',
                HealthCheckTimeoutSeconds: 10,
                HealthyThresholdCount: 2
            }
        },
        OutpostTaskRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'ecs-tasks.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Policies: [{
                    PolicyName: cf.join('-', [cf.stackName, 'api-policy']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'ssmmessages:CreateControlChannel',
                                'ssmmessages:CreateDataChannel',
                                'ssmmessages:OpenControlChannel',
                                'ssmmessages:OpenDataChannel'
                            ],
                            Resource: '*'
                        },{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }]
            }
        },
        OutpostExecRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'ecs-tasks.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Policies: [{
                    PolicyName: cf.join([cf.stackName, '-api-logging']),
                    PolicyDocument: {
                        Statement: [{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams'
                            ],
                            Resource: [cf.join(['arn:', cf.partition, ':logs:*:*:*'])]
                        }]
                    }
                }],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'])
                ],
                Path: '/service-role/'
            }
        },
        OutpostTaskDefinition: {
            Type: 'AWS::ECS::TaskDefinition',
            Properties: {
                Family: cf.stackName,
                Cpu: cf.if('CreateProdResources', 512, 256),
                Memory: cf.if('CreateProdResources', 1024, 512),
                NetworkMode: 'awsvpc',
                RequiresCompatibilities: ['FARGATE'],
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ldap-outpost'])
                }],
                ExecutionRoleArn: cf.getAtt('OutpostExecRole', 'Arn'),
                TaskRoleArn: cf.getAtt('OutpostTaskRole', 'Arn'),
                ContainerDefinitions: [{
                    Name: 'AuthentikLdapOutpost',
                    Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/tak-vpc-', cf.ref('Environment'), '-auth:', cf.ref('GitSha'), '-ldap']),
                    PortMappings: [{
                        ContainerPort: 3389
                    }],
                    Environment: [
                        { Name: 'StackName',                    Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION',           Value: cf.region },
                        { Name: 'AUTHENTIK_HOST',               Value: cf.join(['https://auth.', cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-hosted-zone-name']))]) },
                        { Name: 'AUTHENTIK_INSECURE',           Value: 'false' },
                        { Name: 'AUTHENTIK_TOKEN',              Value: {
                            'Fn::Sub': [
                                '{{resolve:secretsmanager:${SecretName}:::AWSCURRENT}}',
                                {
                                    SecretName: {
                                        'Fn::Join': ['/', [{
                                            'Fn::Join': ['-', [{
                                                'Fn::Select': [0, {
                                                    'Fn::Split': ['-ldap-', cf.stackName]
                                                }]
                                            }, {
                                                'Fn::Select': [1, {
                                                    'Fn::Split': ['-ldap-', cf.stackName]
                                                }]
                                            }]]
                                        }, 'authentik-ldap-token']]
                                    }
                                }
                            ]
                        } }
                    ],
                    LogConfiguration: {
                        LogDriver: 'awslogs',
                        Options: {
                            'awslogs-group': cf.stackName,
                            'awslogs-region': cf.region,
                            'awslogs-stream-prefix': cf.stackName,
                            'awslogs-create-group': true
                        }
                    },
                    Essential: true
                }]
            }
        },
        OutpostService: {
            Type: 'AWS::ECS::Service',
            Properties: {
                ServiceName: cf.join('-', [cf.stackName, 'LDAP-Outpost']),
                Cluster: cf.join(['tak-vpc-', cf.ref('Environment')]),
                DeploymentConfiguration: {
                    Alarms: {
                        AlarmNames: [],
                        Enable: false,
                        Rollback: false
                    },
                    MaximumPercent: 200,
                    MinimumHealthyPercent: 50
                },
                EnableExecuteCommand: false,
                TaskDefinition: cf.ref('OutpostTaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: cf.if('CreateProdResources', 2, 1),
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'DISABLED',
                        SecurityGroups: [cf.ref('OutpostServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                            cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                        ]
                    }
                },
                LoadBalancers: [{
                    ContainerName: 'AuthentikLdapOutpost',
                    ContainerPort: 3389,
                    TargetGroupArn: cf.ref('OutpostTargetGroup3389')
                }]
            }
        },
        OutpostServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ecs-ldap-sg'])
                }],
                GroupDescription: cf.join('-', [cf.stackName, 'ecs-sg']),
                VpcId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc'])),
                SecurityGroupIngress: [{
                    Description: 'LDAP Traffic From TLS-Terminating NLB',
                    SourceSecurityGroupId: cf.ref('NLBSecurityGroup'),
                    IpProtocol: 'tcp',
                    FromPort: 3389,
                    ToPort: 3389
                }]
            }
        }
    },
    Conditions: {
        CreateProdResources: cf.equals(cf.ref('EnvType'), 'prod')
    },
    Outputs: {
        LDAP: {
            Description: 'LDAPS endpoint for Route53 alias target',
            Export: {
                Name: cf.join([cf.stackName, '-ldap'])
            },
            Value: cf.getAtt('NLB', 'DNSName')
        }
    }
};
