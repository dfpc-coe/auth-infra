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
        }
    }
};
