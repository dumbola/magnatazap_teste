
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
    console.log('Force waking all instances...');

    // 1. Get all instances
    const instances = await prisma.instance.findMany();

    console.log(`Found ${instances.length} instances total.`);

    for (const instance of instances) {
        if (instance.status !== 'CONNECTED') {
            console.log(`[WAKE] Force starting instance: ${instance.name} (${instance.sessionId}) which is currently ${instance.status}`);
        } else {
            console.log(`[CHECK] Instance ${instance.name} is marked CONNECTED. Ensuring it is running by re-initing anyway (safe operation).`);
        }

        // Call the internal API to init
        // We can't easily call the Service directly from a script without Nest context, 
        // so we will use the HTTP endpoint since the API is running on localhost:4000
        try {
            // We need a valid JWT or API Key. 
            // Or we can just use the Service if we Bootstrapped the App, but that's lighter to just hit the endpoint if we have a key.
            // Actually, let's try to bootstrap the partial logic or just use a raw axios call with the user's API Key.

            const user = await prisma.user.findUnique({ where: { id: instance.userId } });
            if (!user || !user.apiKey) {
                console.error(`Skipping ${instance.name}: No API Key found for user.`);
                continue;
            }

            console.log(`Invoking /instance/init for ${instance.name}...`);
            await axios.post('http://localhost:4000/instance/init', {
                name: instance.name,
                phoneNumber: instance.phone || undefined
            }, {
                headers: {
                    // Assuming API Key auth is supported or we simulate it.
                    // The InstanceController uses @UseGuards(AuthGuard(['jwt', 'api-key']))
                    'x-api-key': user.apiKey
                }
            });
            console.log(`[SUCCESS] Woke up ${instance.name}`);

        } catch (e: any) {
            console.error(`[FAIL] Could not wake ${instance.name}: ${e.message}`);
            if (e.response) {
                console.error('Response:', e.response.data);
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
