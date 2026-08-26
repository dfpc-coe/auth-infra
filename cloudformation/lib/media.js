import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        MediaBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketName: cf.join([cf.stackName, '-', cf.region, '-media']),
                OwnershipControls: {
                    Rules: [{
                        ObjectOwnership: 'BucketOwnerEnforced'
                    }]
                },
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [{
                        ServerSideEncryptionByDefault: {
                            KMSMasterKeyID: cf.ref('KMSAlias'),
                            SSEAlgorithm: 'aws:kms'
                        },
                        BucketKeyEnabled: true
                    }]
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true
                },
                CorsConfiguration: {
                    CorsRules: [{
                        AllowedOrigins: [
                            cf.join(['https://auth.', cf.importValue(cf.join(['tak-vpc-', cf.ref('Environment'), '-hosted-zone-name']))])
                        ],
                        AllowedHeaders: ['Authorization'],
                        AllowedMethods: ['GET'],
                        MaxAge: 3000
                    }]
                }
            },
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain'
        }
    },
    Outputs: {
        MediaBucket: {
            Description: 'Authentik Media Bucket ARN',
            Export: {
                Name: cf.join([cf.stackName, '-media-s3'])
            },
            Value: cf.getAtt('MediaBucket', 'Arn')
        }
    }
};
