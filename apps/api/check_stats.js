
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        const pending = await prisma.campaignLead.count({ where: { status: 'PENDING' } });
        const sent = await prisma.campaignLead.count({ where: { status: 'SENT' } });
        const failed = await prisma.campaignLead.count({ where: { status: 'FAILED' } });
        const processing = await prisma.campaignLead.count({ where: { status: 'PROCESSING' } });

        console.log('--- Lead Statistics ---');
        console.log(`PENDING: ${pending}`);
        console.log(`SENT: ${sent}`);
        console.log(`FAILED: ${failed}`);
        console.log(`PROCESSING: ${processing}`);

        const instances = await prisma.instance.findMany({ select: { name: true, status: true } });
        console.log('\n--- Instance Statuses ---');
        instances.forEach((i) => {
            console.log(`${i.name}: ${i.status}`);
        });

        const campaigns = await prisma.campaign.findMany({
            where: { status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] } },
            select: { id: true, status: true, sentCount: true }
        });

        console.log('\n--- Campaigns ---');
        if (campaigns.length === 0) console.log('No ACTIVE/PAUSED campaigns found.');
        campaigns.forEach((c) => {
            console.log(`Campaign ${c.id}: ${c.status} (Sent: ${c.sentCount})`);
        });

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentSends = await prisma.campaignLead.groupBy({
            by: ['assignedInstanceId'],
            where: {
                status: 'SENT',
                sentAt: { gte: tenMinutesAgo }
            },
            _count: { id: true }
        });

        console.log('\n--- Recent Sends (Last 10 min) ---');
        if (recentSends.length === 0) console.log('No recent sends detected.');
        recentSends.forEach((r) => {
            console.log(`Instance ${r.assignedInstanceId}: ${r._count.id} sent`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
