
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const instance = await prisma.instance.findFirst({
    where: { name: 'teste' }
  });
  console.log(JSON.stringify(instance, null, 2));
}
main();

