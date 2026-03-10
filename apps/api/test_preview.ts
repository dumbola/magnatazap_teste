
import { getLinkPreview } from 'link-preview-js';
import * as fs from 'fs';

async function test() {
    // URL from the screenshot
    const url = 'https://luciano.entregaexpressa.com/';
    console.log(`Testing URL: ${url}`);

    try {
        const data: any = await getLinkPreview(url, {
            imagesPropertyType: 'og',
            followRedirects: 'follow',
            headers: {
                'User-Agent': 'WhatsApp/2.23.18.79 i'
            }
        });

        console.log('Preview Data:', JSON.stringify(data, null, 2));

        if (data.images && data.images.length > 0) {
            const imgUrl = data.images[0];
            console.log(`Attempting to fetch image: ${imgUrl}`);

            // Check if relative
            let finalImgUrl = imgUrl;
            if (imgUrl.startsWith('/')) {
                const u = new URL(url);
                finalImgUrl = `${u.protocol}//${u.host}${imgUrl}`;
                console.log(`Resolved Relative URL to: ${finalImgUrl}`);
            }

            const res = await fetch(finalImgUrl);
            console.log(`Image Fetch Status: ${res.status} ${res.statusText}`);

            if (res.ok) {
                const buffer = await res.arrayBuffer();
                console.log(`Image Size: ${buffer.byteLength} bytes`);
                // fs.writeFileSync('debug_preview.jpg', Buffer.from(buffer));
                // console.log('Saved debug_preview.jpg');
            } else {
                console.error('Failed to download image');
            }
        } else {
            console.warn('No images found in metadata');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
