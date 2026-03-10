
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log(`\n=== LIST OF INSTANCES ===\n`);
    const instances = await prisma.instance.findMany();
    instances.forEach(i => {
        console.log(`Name: ${i.name} | SessionId: ${i.sessionId} | Status: ${i.status} | ID: ${i.id}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
