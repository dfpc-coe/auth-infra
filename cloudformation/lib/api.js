import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        Logs: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
                LogGroupName: cf.stackName,
                RetentionInDays: 7
            }
        },
        ELB: {
            Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
            Properties: {
                Name: cf.stackName,
                Type: 'application',
                SecurityGroups: [cf.ref('ELBSecurityGroup')],
                Subnets:  [
                    cf.importValue(cf.join([cf.ref('NetworkName'), '-subnet-public-a'])),
                    cf.importValue(cf.join([cf.ref('NetworkName'), '-subnet-public-b']))
                ]
            }

        },
        ELBSecurityGroup: {
            Type : 'AWS::EC2::SecurityGroup',
            Properties : {
                GroupDescription: cf.join('-', [cf.stackName, 'elb-sg']),
                SecurityGroupIngress: [{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443
                },{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80
                }],
                VpcId: cf.importValue(cf.join([cf.ref('NetworkName'), '-vpc']))
            }
        },
        HttpsListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                Certificates: [{
                    CertificateArn: cf.join(['arn:', cf.partition, ':acm:', cf.region, ':', cf.accountId, ':certificate/', cf.ref('SSLCertificateIdentifier')])
                }],
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: cf.ref('TargetGroup')
                }],
                LoadBalancerArn: cf.ref('ELB'),
                Port: 443,
                Protocol: 'HTTPS'
            }
        },
        HttpListener: {
            Type: 'AWS::ElasticLoadBalancingV2::Listener',
            Properties: {
                DefaultActions: [{
                    Type: 'redirect',
                    RedirectConfig: {
                        Protocol: 'HTTPS',
                        StatusCode: 'HTTP_301',
                        Port: 443
                    }
                }],
                LoadBalancerArn: cf.ref('ELB'),
                Port: 80,
                Protocol: 'HTTP'
            }
        },
        TargetGroup: {
            Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            DependsOn: 'ELB',
            Properties: {
                HealthCheckEnabled: true,
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/api',
                Port: 5000,
                Protocol: 'HTTP',
                TargetType: 'ip',
                VpcId: cf.importValue(cf.join([cf.ref('NetworkName'), '-vpc']))
                Matcher: {
                    HttpCode: '200,202,302,304'
                }
            }
        },
        ECSCluster: {
            Type: 'AWS::ECS::Cluster',
            Properties: {
                ClusterName: cf.join('-', [cf.stackName, 'cluster'])
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
                            Resource: [
                                cf.join(['arn:', cf.partition, ':s3:::', cf.ref('AssetBucket')]),
                                cf.join(['arn:', cf.partition, ':s3:::', cf.ref('AssetBucket'), '/*'])
                            ],
                            Action: '*'
                        },{
                            Effect: 'Allow',
                            Action: [
                                'ecr:Describe*',
                                'ecr:Get*',
                                'ecr:List*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':ecr:', cf.region, ':', cf.accountId, ':repository/coe-ecr-etl-tasks'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'kms:Decrypt',
                                'kms:GenerateDataKey'
                            ],
                            Resource: [cf.getAtt('KMS', 'Arn')]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'dynamodb:*'
                            ],
                            Resource: [
                                cf.getAtt('DDBTable', 'Arn'),
                                cf.join([cf.getAtt('DDBTable', 'Arn'), '/*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'secretsmanager:Describe*',
                                'secretsmanager:Get*',
                                'secretsmanager:List*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':secretsmanager:', cf.region, ':', cf.accountId, ':secret:', cf.stackName, '/*'])
                            ]
                        },{ // ------------ Permissions Required to stand up lambda tasks ------------
                            Effect: 'Allow',
                            Action: [
                                'iam:PassRole'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':iam::', cf.accountId, ':role/', cf.stackName])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'cloudformation:*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':cloudformation:', cf.region, ':', cf.accountId, ':stack/', cf.stackName, '-layer-*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'cloudwatch:Describe*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':cloudwatch:', cf.region, ':', cf.accountId, ':alarm:*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'cloudwatch:PutMetricData'
                            ],
                            Resource: [
                                '*'
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'cloudwatch:Get*',
                                'cloudwatch:List*',
                                'cloudwatch:PutMetricAlarm',
                                'cloudwatch:DeleteAlarms'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':cloudwatch:', cf.region, ':', cf.accountId, ':alarm:', cf.stackName, '-layer-*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'logs:CreateLogGroup',
                                'logs:DeleteLogGroup',
                                'logs:PutRetentionPolicy',
                                'logs:describe*',
                                'logs:get*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':logs:', cf.region, ':', cf.accountId, ':log-group:/aws/lambda/', cf.stackName, '-layer-*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'lambda:*'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':lambda:', cf.region, ':', cf.accountId, ':function:', cf.stackName, '-layer-*'])
                            ]
                        },{
                            Effect: 'Allow', // Create events for scheduled ETL
                            Action: [
                                'events:PutRule',
                                'events:DescribeRule',
                                'events:ListRules',
                                'events:PutTargets',
                                'events:RemoveTargets',
                                'events:DisableRule',
                                'events:EnableRule',
                                'events:DeleteRule'
                            ],
                            Resource: [
                                cf.join(['arn:', cf.partition, ':events:', cf.region, ':', cf.accountId, ':rule/', cf.stackName, '-*'])
                            ]
                        },{
                            Effect: 'Allow',
                            Action: [
                                'batch:SubmitJob',
                                'batch:ListJobs',
                                'batch:DescribeJobs',
                                'logs:GetLogEvents',
                                'batch:CancelJob',
                                'batch:DescribeJobs'
                            ],
                            Resource: [
                                '*'
                            ]
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
                ContainerDefinitions: [{
                    Name: 'api',
                    Image: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/coe-ecr-etl:', cf.ref('GitSha')]),
                    PortMappings: [{
                        ContainerPort: 5000
                    }],
                    Environment: [
                        {
                            Name: 'POSTGRES',
                            Value: cf.join([
                                'postgresql://',
                                cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:username:AWSCURRENT}}'),
                                ':',
                                cf.sub('{{resolve:secretsmanager:${AWS::StackName}/rds/secret:SecretString:password:AWSCURRENT}}'),
                                '@',
                                cf.getAtt('DBInstance', 'Endpoint.Address'),
                                ':5432/tak_ps_etl?sslmode=no-verify'
                            ])
                        },
                        { Name: 'TileBaseURL', Value: cf.join(['s3://', cf.ref('AssetBucket'), '/zipcodes.tilebase']) },
                        { Name: 'SigningSecret', Value: cf.sub('{{resolve:secretsmanager:${AWS::StackName}/api/secret:SecretString::AWSCURRENT}}') },
                        { Name: 'StackName', Value: cf.stackName },
                        { Name: 'ASSET_BUCKET', Value: cf.ref('AssetBucket') },
                        { Name: 'API_URL', Value: cf.ref('HostedURL') },
                        { Name: 'PMTILES_URL', Value: cf.join(['https://', cf.ref('PMTilesLambdaAPI'), '.execute-api.', cf.region, '.amazonaws.com']) },
                        { Name: 'MartiAPI', Value: cf.ref('MartiAPI') },
                        { Name: 'AuthGroup', Value: cf.ref('AuthGroup') },
                        { Name: 'AWS_DEFAULT_REGION', Value: cf.region }
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
                Cluster: cf.ref('ECSCluster'),
                TaskDefinition: cf.ref('TaskDefinition'),
                LaunchType: 'FARGATE',
                HealthCheckGracePeriodSeconds: 300,
                DesiredCount: 1,
                NetworkConfiguration: {
                    AwsvpcConfiguration: {
                        AssignPublicIp: 'ENABLED',
                        SecurityGroups: [cf.ref('ServiceSecurityGroup')],
                        Subnets:  [
                            cf.importValue(cf.join([cf.ref('NetworkName'), '-subnet-public-a'])),
                            cf.importValue(cf.join([cf.ref('NetworkName'), '-subnet-public-b']))
                        ]
                    }
                },
                LoadBalancers: [{
                    ContainerName: 'api',
                    ContainerPort: 5000,
                    TargetGroupArn: cf.ref('TargetGroup')
                }]
            }
        },
        ServiceSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: cf.join('-', [cf.stackName, 'ec2-sg']),
                VpcId: cf.importValue(cf.join([cf.ref('NetworkName'), '-vpc']))
                SecurityGroupIngress: [{
                    CidrIp: '0.0.0.0/0',
                    IpProtocol: 'tcp',
                    FromPort: 5000,
                    ToPort: 5000
                }]
            }
        },
        ETLFunctionRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: cf.stackName,
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: {
                            Service: 'lambda.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }]
                },
                Path: '/',
                Policies: [],
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'])
                ]
            }
        }
    },
    Outputs: {
        API: {
            Description: 'API ELB',
            Value: cf.join(['http://', cf.getAtt('ELB', 'DNSName')])
        },
        HostedURL: {
            Description: 'Hosted API Location',
            Export: {
                Name: cf.join([cf.stackName, '-hosted'])
            },
            Value: cf.ref('HostedURL')
        },
        ETLRole: {
            Description: 'ETL Lambda Role',
            Export: {
                Name: cf.join([cf.stackName, '-etl-role'])
            },
            Value: cf.getAtt('ETLFunctionRole', 'Arn')
        }
    }
};
