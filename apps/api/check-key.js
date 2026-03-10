
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const key = '59941b9f-148c-4236-b5e4-5a7a2cdf98ae'; // Key from screenshot
    console.log(`Checking key: '${key}'`);

    const user = await prisma.user.findUnique({
        where: { apiKey: key }
    });

    if (user) {
        console.log('FOUND User:', user.email, user.id);
    } else {
        console.log('NOT FOUND. Listing all keys:');
        const all = await prisma.user.findMany({ select: { email: true, apiKey: true } });
        console.table(all);
    }
}

check()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
