const AWS = require('aws-sdk');
const ec2 = new AWS.EC2();

module.exports.createAMIs = async (event) => {
    try {
        // 1. Describe EC2 Instances with the "backup" tag
        const instances = await ec2.describeInstances({
            Filters: [
                { Name: "tag:Name", Values: ["backup"] },
                { Name: "instance-state-name", Values: ["running"] }
            ]
        }).promise();

        const instanceIds = [];
        instances.Reservations.forEach(reservation => {
            reservation.Instances.forEach(instance => {
                instanceIds.push({
                    InstanceId: instance.InstanceId,
                    Name: instance.Tags.find(tag => tag.Key === 'Name')?.Value || 'Unnamed'
                });
            });
        });

        if (instanceIds.length === 0) {
            console.log("No instances found with the 'backup' tag.");
            return;
        }

        console.log(`Found ${instanceIds.length} instances to back up:`, instanceIds);

        // 2. Create AMIs for each instance
        const createImagePromises = instanceIds.map(async ({ InstanceId, Name }) => {
            const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
            const imageName = `${Name}-${InstanceId}-${timestamp}`;
            const result = await ec2.createImage({
                InstanceId,
                Name: imageName,
                Description: `Automated backup for ${InstanceId}`,
                NoReboot: true
            }).promise();

            // 3. Tag the AMI with a custom tag
            await ec2.createTags({
                Resources: [result.ImageId],
                Tags: [
                    { Key: 'backup', Value: 'true' },
                    { Key: 'Name', Value: imageName }
                ]
            }).promise();

            console.log(`Created AMI ${result.ImageId} for instance ${InstanceId}`);
            return result.ImageId;
        });

        await Promise.all(createImagePromises);
        console.log("Backup process completed successfully.");
    } catch (error) {
        console.error("Error creating AMIs:", error);
        throw error;
    }
};
