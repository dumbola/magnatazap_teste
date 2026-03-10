import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DEBUG DB START ---');

    // 1. Check Instances
    const instances = await prisma.instance.findMany();
    console.log(`\nFound ${instances.length} Instances:`);
    instances.forEach(i => {
        console.log(`- ID: ${i.id}, Name: ${i.name}, Status: ${i.status}, UserID: ${i.userId}`);
    });

    // 2. Check Campaigns
    const campaigns = await prisma.campaign.findMany();
    console.log(`\nFound ${campaigns.length} Campaigns:`);
    campaigns.forEach(c => {
        console.log(`- ID: ${c.id}, Status: ${c.status}, UserID: ${c.userId}`);
    });

    // 3. Check Leads (Limit 10)
    const leads = await prisma.campaignLead.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });
    console.log(`\nFound ${leads.length} Recent Leads:`);
    leads.forEach(l => {
        console.log(`- ID: ${l.id}, Status: ${l.status}, SentAt: ${l.sentAt}, CampaignID: ${l.campaignId}`);
    });

    // 4. Check Users
    const users = await prisma.user.findMany();
    console.log(`\nFound ${users.length} Users:`);
    users.forEach(u => {
        console.log(`- ID: ${u.id}, Email: ${u.email}`);
    });

    console.log('--- DEBUG DB END ---');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
