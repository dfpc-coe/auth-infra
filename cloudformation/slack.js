import cf from '@openaddresses/cloudfriend';

export default cf.merge({
    Description: 'SCIM bridge for syncing Authentik groups to Slack channels via @tak-ps/auth-infra',
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
        SCIMSharedSecret: {
            Description: 'Bearer token Authentik will present when calling the SCIM endpoint',
            Type: 'String',
            NoEcho: true,
            MinLength: 32
        },
        SlackUserToken: {
            Description: 'Slack user OAuth token (xoxp-...) for a workspace admin. Requires channels:read, channels:manage, channels:write.invites, groups:read, groups:write, users:read, users:read.email',
            Type: 'String',
            NoEcho: true,
            AllowedPattern: '^xox[pbe]-.+$'
        },
        SlackGroupPrefix: {
            Description: 'Only Authentik groups with this prefix are synced; the prefix is stripped from the Slack channel name',
            Type: 'String',
            Default: 'tak_'
        },
        SlackPrivateChannels: {
            Description: 'Create synced channels as private channels',
            Type: 'String',
            AllowedValues: ['true', 'false'],
            Default: 'true'
        }
    },
    Resources: {
        Logs: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
                LogGroupName: cf.join(['/aws/lambda/', cf.stackName, '-scim']),
                RetentionInDays: 7
            }
        },
        VPCEndpointSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupName: cf.join([cf.stackName, '-execute-api-sg']),
                GroupDescription: 'Allow HTTPS to the private SCIM API from within the VPC',
                VpcId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc'])),
                SecurityGroupIngress: [{
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    CidrIp: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc-cidr']))
                }]
            }
        },
        VPCEndpoint: {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcEndpointType: 'Interface',
                ServiceName: cf.join(['com.amazonaws.', cf.region, '.execute-api']),
                VpcId: cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-vpc'])),
                PrivateDnsEnabled: true,
                SecurityGroupIds: [cf.ref('VPCEndpointSecurityGroup')],
                SubnetIds: [
                    cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                    cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-subnet-private-b']))
                ]
            }
        },
        API: {
            Type: 'AWS::ApiGateway::RestApi',
            Properties: {
                Name: cf.join([cf.stackName, '-scim']),
                Description: 'Private SCIM endpoint for Authentik to Slack group sync',
                EndpointConfiguration: {
                    Types: ['PRIVATE'],
                    VpcEndpointIds: [cf.ref('VPCEndpoint')]
                },
                Policy: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: '*',
                        Action: 'execute-api:Invoke',
                        Resource: 'execute-api:/*'
                    }, {
                        Effect: 'Deny',
                        Principal: '*',
                        Action: 'execute-api:Invoke',
                        Resource: 'execute-api:/*',
                        Condition: {
                            StringNotEquals: {
                                'aws:SourceVpce': cf.ref('VPCEndpoint')
                            }
                        }
                    }]
                }
            }
        },
        APIProxyResource: {
            Type: 'AWS::ApiGateway::Resource',
            Properties: {
                RestApiId: cf.ref('API'),
                ParentId: cf.getAtt('API', 'RootResourceId'),
                PathPart: '{proxy+}'
            }
        },
        APIRootMethod: {
            Type: 'AWS::ApiGateway::Method',
            Properties: {
                RestApiId: cf.ref('API'),
                ResourceId: cf.getAtt('API', 'RootResourceId'),
                HttpMethod: 'ANY',
                AuthorizationType: 'NONE',
                Integration: {
                    Type: 'AWS_PROXY',
                    IntegrationHttpMethod: 'POST',
                    Uri: cf.join(['arn:', cf.partition, ':apigateway:', cf.region, ':lambda:path/2015-03-31/functions/', cf.getAtt('Lambda', 'Arn'), '/invocations'])
                }
            }
        },
        APIProxyMethod: {
            Type: 'AWS::ApiGateway::Method',
            Properties: {
                RestApiId: cf.ref('API'),
                ResourceId: cf.ref('APIProxyResource'),
                HttpMethod: 'ANY',
                AuthorizationType: 'NONE',
                Integration: {
                    Type: 'AWS_PROXY',
                    IntegrationHttpMethod: 'POST',
                    Uri: cf.join(['arn:', cf.partition, ':apigateway:', cf.region, ':lambda:path/2015-03-31/functions/', cf.getAtt('Lambda', 'Arn'), '/invocations'])
                }
            }
        },
        APIDeployment: {
            Type: 'AWS::ApiGateway::Deployment',
            DependsOn: ['APIRootMethod', 'APIProxyMethod'],
            Properties: {
                RestApiId: cf.ref('API')
            }
        },
        APIStage: {
            Type: 'AWS::ApiGateway::Stage',
            Properties: {
                RestApiId: cf.ref('API'),
                DeploymentId: cf.ref('APIDeployment'),
                StageName: 'scim',
                MethodSettings: [{
                    ResourcePath: '/*',
                    HttpMethod: '*',
                    ThrottlingBurstLimit: 20,
                    ThrottlingRateLimit: 10
                }]
            }
        },
        LambdaPermission: {
            Type: 'AWS::Lambda::Permission',
            Properties: {
                Action: 'lambda:InvokeFunction',
                FunctionName: cf.ref('Lambda'),
                Principal: 'apigateway.amazonaws.com',
                SourceArn: cf.join(['arn:', cf.partition, ':execute-api:', cf.region, ':', cf.accountId, ':', cf.ref('API'), '/*'])
            }
        },
        Lambda: {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['Logs'],
            Properties: {
                FunctionName: cf.join([cf.stackName, '-scim']),
                Description: 'SCIM endpoint syncing Authentik groups to Slack channels',
                PackageType: 'Image',
                MemorySize: 256,
                Timeout: 120,
                Role: cf.getAtt('LambdaRole', 'Arn'),
                Code: {
                    ImageUri: cf.join([cf.accountId, '.dkr.ecr.', cf.region, '.amazonaws.com/tak-vpc-', cf.ref('Environment'), '-auth:', cf.ref('GitSha'), '-scim'])
                },
                Environment: {
                    Variables: {
                        StackName: cf.stackName,
                        SCIM_BASE_URL: cf.join(['https://', cf.ref('API'), '.execute-api.', cf.region, '.amazonaws.com/scim']),
                        SCIM_SHARED_SECRET: cf.ref('SCIMSharedSecret'),
                        SLACK_USER_TOKEN: cf.ref('SlackUserToken'),
                        SLACK_GROUP_PREFIX: cf.ref('SlackGroupPrefix'),
                        SLACK_PRIVATE_CHANNELS: cf.ref('SlackPrivateChannels')
                    }
                }
            }
        },
        LambdaRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: cf.join([cf.stackName, '-scim']),
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
                ManagedPolicyArns: [
                    cf.join(['arn:', cf.partition, ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'])
                ]
            }
        }
    },
    Outputs: {
        SCIMURL: {
            Description: 'SCIM base URL for the Authentik SCIM provider (reachable from inside the VPC only)',
            Export: {
                Name: cf.join([cf.stackName, '-scim-url'])
            },
            Value: cf.join(['https://', cf.ref('API'), '.execute-api.', cf.region, '.amazonaws.com/', cf.ref('APIStage')])
        },
        VPCEndpoint: {
            Description: 'execute-api VPC Endpoint ID',
            Value: cf.ref('VPCEndpoint')
        }
    }
});
