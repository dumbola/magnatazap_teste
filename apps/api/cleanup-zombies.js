const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Status Diagnostics...");

    const statusCounts = await prisma.instance.groupBy({
        by: ['status'],
        _count: { id: true }
    });

    console.log("Instance Status Counts:");
    statusCounts.forEach(c => {
        console.log(`${c.status}: ${c._count.id}`);
    });

    console.log("Diagnostics Complete.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
