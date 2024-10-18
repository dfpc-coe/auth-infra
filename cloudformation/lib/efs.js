import cf from '@openaddresses/cloudfriend';

export default {
    Resources: {
        EFS: {
            Type: 'AWS::EFS::FileSystem',
            Properties: {
                BackupPolicy: {
                    Status: 'DISABLED'
                },
                Encrypted: true,
                PerformanceMode: 'generalPurpose',
                ThroughputMode: 'bursting'
            }
        },
        EFSMountTargetSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                VpcId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc'])),
                GroupDescription: 'EFS to Auth ECS Service',
                SecurityGroupIngress: [{
                    IpProtocol: 'tcp',
                    FromPort: 2049,
                    ToPort: 2049,
                    CidrIp: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-vpc-cidr']))
                }]
            }
        },
        EFSMountTargetSubnetPrivateA: {
            Type: 'AWS::EFS::MountTarget',
            Properties: {
                FileSystemId: cf.ref('EFS'),
                SubnetId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-a'])),
                SecurityGroups: [cf.ref('EFSMountTargetSecurityGroup')]
            }
        },
        EFSMountTargetSubnetPrivateB: {
            Type: 'AWS::EFS::MountTarget',
            Properties: {
                FileSystemId: cf.ref('EFS'),
                SubnetId: cf.importValue(cf.join(['coe-vpc-', cf.ref('Environment'), '-subnet-private-b'])),
                SecurityGroups: [cf.ref('EFSMountTargetSecurityGroup')]
            }
        }
    }
};
