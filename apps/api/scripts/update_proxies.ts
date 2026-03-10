
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from current directory (we will copy .env to root)
dotenv.config({ path: path.resolve(__dirname, '.env') });

const prisma = new PrismaClient();

const PROXY_LIST = [
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-85.28.36.227:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-178.171.28.33:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-85.28.38.26:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-85.28.39.45:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-85.28.40.80:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-200.160.46.241:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-69.17.113.99:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-185.185.147.184:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-200.160.44.224:82rnrzhktw0y@brd.superproxy.io:33335",
    "http://brd-customer-hl_b1aa2a1f-zone-2k-ip-178.171.29.253:82rnrzhktw0y@brd.superproxy.io:33335"
];

async function main() {
    console.log("Starting Proxy Migration...");

    const instances = await prisma.instance.findMany({
        orderBy: { name: 'asc' } // Ensure deterministic order
    });

    console.log(`Found ${instances.length} instances.`);

    for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        // Rotate through the 10 proxies
        const proxyUrl = PROXY_LIST[i % PROXY_LIST.length];

        const proxyConfig = JSON.stringify({ proxyUrl });

        console.log(`[${i + 1}/${instances.length}] Updating ${instance.name} (${instance.sessionId}) -> ${proxyUrl.split('@')[1]}`);

        await prisma.instance.update({
            where: { id: instance.id },
            data: { proxyConfig }
        });
    }

    console.log("Migration Complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
