
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const logs = await prisma.systemLog.findMany({ take: 5 });
        console.log('System Logs Count:', await prisma.systemLog.count());
        console.log('Last 5 Logs:', logs);
    } catch (e) {
        console.error('Error fetching logs:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
