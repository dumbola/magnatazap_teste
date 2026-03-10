
const https = require('https');

function fetch(url) {
    const req = https.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetch(res.headers.location);
            return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (data.includes('baner2')) {
                console.log('FOUND baner2!');
                // Print context
                const idx = data.indexOf('baner2');
                console.log(data.substring(idx - 100, idx + 100));
            } else {
                console.log('baner2 NOT FOUND in HTML body');
            }

            // Allow looking for any og:image
            const ogImage = data.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (ogImage) {
                console.log('Found og:image tag:', ogImage[0]);
            } else {
                console.log('No og:image tag found via regex');
            }
        });
    });
}
fetch('https://luciano.entregaexpressa.com/');
