import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { URL } from 'url';

/**
 * Creates a custom Agent that manually handles the HTTP CONNECT tunnel via raw TCP.
 * This ensures we return a valid net.Socket and handle the handshake reliably.
 */
export function createLpmAgent(proxyUrl: string, authHeader?: string): https.Agent {
    const proxy = new URL(proxyUrl);
    const proxyHost = proxy.hostname;
    const proxyPort = parseInt(proxy.port) || 80;

    // Extend https.Agent to override createConnection
    class LpmAgent extends https.Agent {
        createConnection(options: http.ClientRequestArgs, cb: (err: Error | null, socket?: net.Socket) => void): net.Socket {
            const targetHost = options.hostname || options.host;
            const targetPort = options.port || 443;

            // 1. Create raw TCP connection to Proxy
            const socket = net.connect(proxyPort, proxyHost);

            // 2. Handle connection establishment
            socket.once('connect', () => {
                const header = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                    `Host: ${targetHost}:${targetPort}\r\n` +
                    (authHeader ? `Proxy-Authorization: ${authHeader}\r\n` : '') +
                    `\r\n`;
                socket.write(header);
            });

            // 4. Handle Handshake Response
            const onData = (data: Buffer) => {
                const response = data.toString();
                if (response.includes('HTTP/1.1 200')) {
                    // Handshake Success!
                    socket.removeListener('data', onData);
                    cb(null, socket);
                } else {
                    // Handshake Failed
                    socket.destroy();
                    cb(new Error(`Proxy handshake failed: ${response.split('\n')[0]}`));
                }
            };

            socket.on('data', onData);

            socket.on('error', (err) => {
                cb(err);
            });

            socket.on('timeout', () => {
                socket.destroy();
                cb(new Error('Proxy connection timed out'));
            });

            return socket;
        }
    }

    return new LpmAgent({
        keepAlive: true,
        timeout: 60000
    });
}
