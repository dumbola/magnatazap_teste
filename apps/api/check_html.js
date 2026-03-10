
const https = require('https');

function fetch(url) {
    console.log(`Fetching: ${url}`);
    const req = https.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    }, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log(`Redirecting to: ${res.headers.location}`);
            fetch(res.headers.location);
            return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('--- HTML HEAD START ---');
            // Print only head to avoid spam
            const head = data.match(/<head>([\s\S]*?)<\/head>/i);
            console.log(head ? head[1] : 'No <head> found');
            console.log('--- HTML HEAD END ---');
        });
    });
    req.on('error', e => console.error(e));
}

fetch('https://luciano.entregaexpressa.com/');
