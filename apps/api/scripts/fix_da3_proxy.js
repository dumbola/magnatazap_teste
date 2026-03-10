const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetInstance = '3e7ba287-9081-47c2-acfa-1ae11e65e981-da3';
    const newProxy = 'http://brd-customer-hl_b1aa2a1f-zone-2k-ip-178.171.28.33:82rnrzhktw0y@brd.superproxy.io:33335';

    const instance = await prisma.instance.findFirst({
        where: {
            OR: [
                { sessionId: targetInstance },
                { name: 'da3' }
            ]
        }
    });

    if (!instance) {
        console.log('Instance da3 not found');
        return;
    }

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

    console.log(`Updated da3 proxy to ${newProxy}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
