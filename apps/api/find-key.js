
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = 'f1442c20-2270-4ec5-ae10-b5293714af24';
    console.log(`Searching for user: ${userId}`);

    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (user) {
        console.log('FOUND USER:', user.email);
        console.log('CORRECT API KEY:', user.apiKey);
    } else {
        console.log('User not found!');
        // List all just in case
        const all = await prisma.user.findMany();
        console.log('All users:', all.map(u => ({ id: u.id, key: u.apiKey })));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
