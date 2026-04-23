import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'https';
import { WebSocket } from 'ws';

async function testProxy(proxyUrlStr: string) {
    const agent = new HttpsProxyAgent(proxyUrlStr);
    
    console.log('Testing proxy:', proxyUrlStr.replace(/:[^:@]+@/, ':***@'));
    
    // 1. Test standard HTTPS request
    await new Promise<void>((resolve, reject) => {
        https.get('https://api.ipify.org?format=json', { agent }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                console.log('HTTPS Test Success:', data);
                resolve();
            });
        }).on('error', e => {
            console.error('HTTPS Test Failed:', e.message);
            resolve();
        });
    });

    // 2. Test WebSocket (this mimics Baileys)
    await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket('wss://web.whatsapp.com/ws/chat', {
            agent,
            origin: 'https://web.whatsapp.com'
        });
        
        ws.on('open', () => {
            console.log('WebSocket Test Success!');
            ws.close();
            resolve();
        });
        
        ws.on('error', (e) => {
            console.error('WebSocket Test Failed:', e.message);
            resolve();
        });
    });
}

async function main() {
    const pass = "s45bfmx0cycq";
    
    // 1. The long username with sticky IP
    const longUrl = `http://qzcuileq-BR-AR-BO-CO-CL-EC-PY-PE-SR-UY-VE-rotate-session-123456:${pass}@p.webshare.io:80`;
    await testProxy(longUrl);
    
    // 2. The short username with sticky IP
    const shortUrl = `http://qzcuileq-rotate-session-123456:${pass}@p.webshare.io:80`;
    await testProxy(shortUrl);
    
    // 3. Short username with country and sticky IP
    const brUrl = `http://qzcuileq-BR-rotate-session-123456:${pass}@p.webshare.io:80`;
    await testProxy(brUrl);
}

main().catch(console.error);
