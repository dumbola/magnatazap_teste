
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const pending = await prisma.lead.count({ where: { status: 'PENDING' } });
    const sent = await prisma.lead.count({ where: { status: 'SENT' } });
    const failed = await prisma.lead.count({ where: { status: 'FAILED' } });
    const processing = await prisma.lead.count({ where: { status: 'PROCESSING' } });

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
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
