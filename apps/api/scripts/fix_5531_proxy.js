const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Can be sessionId or name (if using name as ID)
    // Based on logs: 3e7ba287-9081-47c2-acfa-1ae11e65e981-5531993047643
    // But usually we can search by exact name if it matches
    const targetInstanceName = '5531993047643';
    const newProxy = 'http://brd-customer-hl_b1aa2a1f-zone-2k-ip-178.171.28.33:82rnrzhktw0y@brd.superproxy.io:33335';

    console.log(`Searching for instance with name containing: ${targetInstanceName}`);

    const instance = await prisma.instance.findFirst({
        where: {
            sessionId: {
                contains: targetInstanceName
            }
        }
    });

    if (!instance) {
        console.log(`Instance ${targetInstanceName} not found`);
        return;
    }

    console.log(`Found instance: ${instance.sessionId}`);

    // Parse existing config to keep browser
    let config = {};
    try {
        config = JSON.parse(instance.proxyConfig || '{}');
    } catch (e) { }

    config.proxyUrl = newProxy;

    await prisma.instance.update({
        where: { id: instance.id },
        data: { proxyConfig: JSON.stringify(config) }
    });

    console.log(`Updated ${instance.sessionId} proxy to ${newProxy}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
