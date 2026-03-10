
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const searchTerm = '5562992693494';

    console.log(`Searching for logs containing: ${searchTerm}`);

    const logs = await prisma.connectionLog.findMany({
        where: {
            instanceName: {
                contains: searchTerm
            }
        },
        orderBy: {
            timestamp: 'desc'
        },
        take: 20
    });

    console.log('Found Logs:', logs.length);
    logs.forEach(log => {
        console.log(`\n[${log.timestamp.toISOString()}] Status: ${log.status} | Reason: ${log.reason}`);
        if (log.metadata) {
            console.log(`Metadata: ${JSON.stringify(log.metadata, null, 2)}`);
        }
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
