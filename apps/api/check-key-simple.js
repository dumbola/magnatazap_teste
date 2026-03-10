
const { PrismaClient } = require('../../node_modules/@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const key = '59941b9f-148c-4236-b5e4-5a7a2cdf98ae';
    console.log(`Checking key: '${key}' in DB...`);

    // Check if user exists with this key
    const user = await prisma.user.findFirst({
        where: { apiKey: key }
    });

    if (user) {
        console.log('✅ KEY FOUND for User:', user.email);
    } else {
        console.log('❌ KEY NOT FOUND in Database.');
        const all = await prisma.user.findMany({ select: { apiKey: true } });
        console.log('Available keys:', all.map(u => u.apiKey));
    }
}

check().catch(console.error).finally(() => prisma.$disconnect());
