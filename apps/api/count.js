const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); async function check() { const count = await prisma.instance.count(); console.log('Count:', count); } check();
