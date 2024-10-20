import cf from '@openaddresses/cloudfriend';

export default {
    Parameters: {
        SSLCertificateIdentifier: {
            Description: 'ACM SSL Certificate for HTTP Protocol',
            Type: 'String'
        },
        LDAPOrganisation: {
            Description: 'LDAP Org',
            Type: 'String'
        },
        LDAPDomain: {
            Description: 'LDAP Org',
            Type: 'String'
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
                    SecretStringTemplate: '{"username": "takldapadmin"}',
                    GenerateStringKey: 'password',
                    ExcludePunctuation: true,
                    PasswordLength: 32
                },
                Name: cf.join([cf.stackName, '/admin']),
                KmsKeyId: cf.ref('KMS')
            }
        },

        ELB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'network',
                Subnets:  [
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-a'])),
                    cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-public-b']))
                ]
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
            DependsOn: 'ELB',
            Properties: {
                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckTimeoutSeconds: 10,
                HealthyThresholdCount: 3,
                HealthCheckProtocol: 'TCP',
                HealthCheckPort: 389,
                Port: 389,
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
                'EFSAccessPointLDAP',
                'EFSAccessPointSLAPD'
            ],
            Properties: {
                Family: cf.stackName,
                Cpu: 1024,
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
                    Name: cf.join([cf.stackName, '-ldap']),
                    EFSVolumeConfiguration: {
                        FilesystemId: cf.ref('EFS'),
                        TransitEncryption: 'ENABLED',
                        AuthorizationConfig: {
                            AccessPointId: cf.ref('EFSAccessPointLDAP')
                        },
                        RootDirectory: '/'
                    }
                },{
                    Name: cf.join([cf.stackName, '-slapd']),
                    EFSVolumeConfiguration: {
                        FilesystemId: cf.ref('EFS'),
                        TransitEncryption: 'ENABLED',
                        AuthorizationConfig: {
                            AccessPointId: cf.ref('EFSAccessPointSLAPD')
                        },
                        RootDirectory: '/'
                    }
                }],
                ContainerDefinitions: [{
                    Name: 'api',
                    Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-ecr-auth:', cf.ref('GitSha')]),
                    MountPoints: [{
                        ContainerPath: '/var/lib/ldap',
                        SourceVolume: cf.join([cf.stackName, '-ldap']),
                    }, {
                        ContainerPath: '/etc/ldap/slapd.d',
                        SourceVolume: cf.join([cf.stackName, '-slapd']),
                    }],
                    PortMappings: [{
                        ContainerPort: 389
                    }],
                    Environment: [
                        { Name: 'StackName', Value: cf.stackName },
                        { Name: 'AWS_DEFAULT_REGION', Value: cf.region },
                        { Name: 'LDAP_ORGANISATION', Value: cf.ref('LDAPOrganisation') },
                        { Name: 'LDAP_DOMAIN', Value: cf.ref('LDAPDomain') },
                        { Name: 'LDAP_ADMIN_USERNAME', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:username:AWSCURRENT}}') },
                        { Name: 'LDAP_ADMIN_PASSWORD', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:password:AWSCURRENT}}') },
                        { Name: 'LDAP_CONFIG_PASSWORD', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/admin:SecretString:password:AWSCURRENT}}') }
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
                    ContainerPort: 389,
                    TargetGroupArn: cf.ref('TargetGroup')
                }]
            }
        },
        ServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: cf.join('-', [cf.stackName, 'ec2-sg']),
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),
                SecurityGroupIngress: [{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 636,
                    ToPort: 636
                },{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 389,
                    ToPort: 389
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
