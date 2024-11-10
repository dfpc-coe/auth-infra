import cf from '@openaddresses/cloudfriend';

export default {
    Parameters: {
        EnableExecute: {
            Description: 'Allow SSH into docker container - should only be enabled for limited debugging',
            Type: 'String',
            AllowedValues: [ 'true', 'false' ],
            Default: false
        },
        SSLCertificateIdentifier: {
            Description: 'ACM SSL Certificate for HTTP Protocol',
            Type: 'String'
        },
        LDAPBaseDN: {
            Description: 'LDAP Base DN',
            Type: 'String',
            Default: 'dc=example,dc=com'
        }
    },
    Resources: {
        Logs: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
                LogGroupName: cf.stackName,
                RetentionInDays: 7
            }
        },
        LDAPMasterSecret: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' LDAP Master Password']),
                GenerateSecretString: {
                    SecretStringTemplate: '{"username": "admin"}',
                    GenerateStringKey: 'password',
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/admin']),
                KmsKeyId: cf.ref('KMS')
            }
        },
        LDAPKeySeedSecret: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' LDAP Key Seed Secret']),
                GenerateSecretString: {
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/seed']),
                KmsKeyId: cf.ref('KMS')
            }
        },
        LDAPSigningSecret: {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Description: cf.join([cf.stackName, ' LDAP JWT Signing Secret']),
                GenerateSecretString: {
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/signing']),
                KmsKeyId: cf.ref('KMS')
            }
        },
        ELB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'network',
                SecurityGroups: [cf.ref('ELBSecurityGroup')],
                Subnets:  [
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-a'])),
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-b']))
                ]
            }

        },
        ELBSecurityGroup: {
            Type : 'AWS::EC2::SecurityGroup',
            Properties : {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'elb-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'elb-sg']),
                GroupDescription: 'Allow 636 Access to ELB',
                SecurityGroupIngress: [{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 636,
                    ToPort: 636
                }],
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc']))
            }
        },
        HttpListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('TargetGroup')
                }],
                Certificates: [{
                    CertificateArn: cf.join(['arn:', cf.partition, ':acm:', cf.region, ':', cf.accountId, ':certificate/', cf.ref('SSLCertificateIdentifier')])
                }],
                SslPolicy: 'ELBSecurityPolicy-TLS-1-2-2017-01',
                LoadBalancerArn: cf.ref('ELB'),
                Port: 636,
                Protocol: 'TLS'
            }
        },
        TargetGroup: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: ['ELB'],
            Properties: {
                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckTimeoutSeconds: 10,
                HealthyThresholdCount: 3,
                HealthCheckProtocol: 'TCP',
                HealthCheckPort: 3389,
                Port: 3389,
                Protocol: 'TCP',
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc']))
            }
        },
        TaskRole: {
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
        ExecRole: {
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
        TaskDefinition: {
            Type: 'AWS::ECS::TaskDefinition',
            DependsOn: [
                'LDAPMasterSecret',
                'EFSAccessPointData'
            ],
            Properties: {
                Family: cf.stackName,
                Cpu: 1024 * 2,
                Memory: 4096 * 2,
                NetworkMode: 'awsvpc',
                RequiresCompatibilities: ['FARGATE'],
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'api'])
                }],
                ExecutionRoleArn: cf.getAtt('ExecRole', 'Arn'),
                TaskRoleArn: cf.getAtt('TaskRole', 'Arn'),
                Volumes: [{
                    Name: cf.join([cf.stackName, '-config']),
                    EFSVolumeConfiguration: {
                        FilesystemId: cf.ref('EFS'),
                        TransitEncryption: 'ENABLED',
                        AuthorizationConfig: {
                            AccessPointId: cf.ref('EFSAccessPointData')
                        },
                        RootDirectory: '/'
                    }
                }],
                ContainerDefinitions: [{
                    Name: 'api',
                    Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-ecr-auth:', cf.ref('GitSha')]),
                    MountPoints: [{
                        ContainerPath: '/data',
                        SourceVolume: cf.join([cf.stackName, '-config']),
                    }],
                    PortMappings: [{
                        ContainerPort: 3389
                    }],
                    Environment: [
                        { Name: 'StackName',            Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION',   Value: cf.region },
                        { Name: 'LLDAP_LDAP_BASE_DN',   Value: cf.ref('LDAPBaseDN') },
                        { Name: 'LLDAP_LDAP_PORT',      Value: '3389' },
                        { Name: 'LLDAP_LDAP_USER_PASS', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:password:AWSCURRENT}}') },
                        { Name: 'LLDAP_JWT_SECRET',     Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/signing:SecretString::AWSCURRENT}}') },
                        { Name: 'LLDAP_KEY_SEED',       Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/seed:SecretString::AWSCURRENT}}') },
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
        Service: {
            Type: 'AWS::ECS::Service',
            Properties: {
                ServiceName: cf.join('-', [cf.stackName, 'Service']),
                Cluster: cf.join(['coe-ecs-', cf.ref('Environment')]),
                EnableExecuteCommand: cf.ref('EnableExecute'),
                TaskDefinition: cf.ref('TaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: 1,
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'ENABLED',
                        SecurityGroups: [cf.ref('ServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-a'])),
                            cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-b']))
                        ]
                    }
                },
                LoadBalancers: [{
                    ContainerName: 'api',
                    ContainerPort: 3389,
                    TargetGroupArn: cf.ref('TargetGroup')
                }]
            }
        },
        ServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                Tags: [{
                    Key: 'Name',
                    Value: cf.join('-', [cf.stackName, 'ecs-service-sg'])
                }],
                GroupName: cf.join('-', [cf.stackName, 'ecs-service-sg']),
                GroupDescription: cf.join('-', [cf.stackName, 'ecs-sg']),
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),
                SecurityGroupIngress: [{
                    Description: 'ELB Traffic',
                    SourceSecurityGroupId: cf.ref('ELBSecurityGroup'),
                    IpProtocol: 'tcp',
                    FromPort: 3389,
                    ToPort: 3389
                }]
            }
        },
    },
    Outputs: {
        API: {
            Description: 'API ELB',
            Value: cf.join(['http://', cf.getAtt('ELB', 'DNSName')])
        },
        LDAPAdminUsername: {
            Description: 'LDAP Admin Username',
            Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:username:AWSCURRENT}}')
        },
        LDAPAdminPassword: {
            Description: 'LDAP Admin Password',
            Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:password:AWSCURRENT}}')
        }
    }
};
