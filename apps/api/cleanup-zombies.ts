import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Phone Cleanup...");

    // Find all instances where phone contains '@'
    const zombies = await prisma.instance.findMany({
        where: {
            phone: { contains: "@" }
        }
    });

    console.log(`Found ${zombies.length} instances with JID as phone.`);

    for (const instance of zombies) {
        if (instance.phone) {
            const cleanPhone = instance.phone.split(':')[0].split('@')[0];
            console.log(`Cleaning ${instance.name}: ${instance.phone} -> ${cleanPhone}`);

            await prisma.instance.update({
                where: { id: instance.id },
                data: { phone: cleanPhone }
            });
        }
    }

    // Also verify Campaign Leads (Just count SENT to debug dashboard)
    const sentCount = await prisma.campaignLead.count({
        where: { status: 'SENT' }
    });
    console.log(`\n--- DASHBOARD DEBUG ---`);
    console.log(`Total SENT Leads in DB: ${sentCount}`);

    const pendingCount = await prisma.campaignLead.count({
        where: { status: 'PENDING' }
    });
    console.log(`Total PENDING Leads in DB: ${pendingCount}`);

    const activeCampaigns = await prisma.campaign.findMany({
        where: { status: 'PROCESSING' }
    });
    console.log(`Active Campaigns: ${activeCampaigns.length}`);
    if (activeCampaigns.length > 0) {
        console.log(`First Active Campaign ID: ${activeCampaigns[0].id}`);
    }

    console.log("Cleanup Complete.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
