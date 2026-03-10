import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// [LUMINATI] Proxy Manager Local URL
const PROXY_LIST = [
    "http://proxy-manager:24000"
];

async function main() {
    console.log(`🔄 Iniciando atualização de proxies para instâncias...`);

    // Buscar todas as instâncias (conectadas ou não)
    const instances = await prisma.instance.findMany();
    console.log(`📋 Encontradas ${instances.length} instâncias.`);

    let updatedCount = 0;

    for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];

        // Seleciona proxy via Round Robin (0, 1, 2... 9, 0, 1...)
        const selectedProxy = PROXY_LIST[i % PROXY_LIST.length];

        // Formata para JSON se o sistema espera JSON, ou String simples
        // Baseado no client.ts novo, ele aceita a string crua e converte sozinho, 
        // mas vamos salvar como JSON { proxyUrl: ... } para padronizar.
        const proxyConfig = JSON.stringify({ proxyUrl: selectedProxy });

        await prisma.instance.update({
            where: { id: instance.id },
            data: { proxyConfig: proxyConfig }
        });

        console.log(`✅ Instância ${instance.name} (${instance.sessionId}) -> Proxy IP Final: ${selectedProxy.split('-ip-')[1]?.split(':')[0] || 'Atribuído'}`);
        updatedCount++;
    }

    console.log(`\n🚀 Concluído! ${updatedCount} instâncias foram atualizadas com a nova lista.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
