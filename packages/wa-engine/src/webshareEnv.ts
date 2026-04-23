import { URL } from 'url';

/** Remove aspas e espaços (Docker / .env às vezes injetam "http://...") */
function sanitizeDsnRaw(raw: string | undefined | null): string {
    if (raw == null) return '';
    let t = String(raw).trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.slice(1, -1).trim();
    }
    return t;
}

/**
 * Webshare rotating residential: username = {base}-{ISO2}-rotate
 * Só variáveis de ambiente (nunca no frontend).
 */
export function normalizeIso2Country(input?: string | null): string | null {
    if (input == null || input === '') return null;
    const t = String(input).trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (t.length < 2) return null;
    return t.slice(0, 2);
}

export function buildWebshareProxyForCountry(iso2: string | null | undefined): string | null {
    const cc = normalizeIso2Country(iso2);
    if (!cc) return null;

    const dsn = sanitizeDsnRaw(process.env.WEBSHARE_WA_DSN);
    if (!dsn) {
        return null;
    }

    try {
        const u = new URL(dsn.startsWith('http') ? dsn : `http://${dsn}`);
        const pass = u.password;
        if (!pass) {
            return null;
        }
        const baseUser = process.env.WEBSHARE_WA_USER_BASE?.trim() || u.username;
        if (!baseUser) {
            return null;
        }
        const useRotate = process.env.WEBSHARE_USE_ROTATE !== '0' && process.env.WEBSHARE_USE_ROTATE !== 'false';
        u.username = useRotate ? `${baseUser}-${cc}-rotate` : `${baseUser}-${cc}`;
        return u.toString();
    } catch {
        return null;
    }
}

/** País Webshare por defeito (ex.: instância sem `useWebshareRegion`). */
export function getDefaultWebshareProxyUrl(): string | null {
    return buildWebshareProxyForCountry(process.env.WEBSHARE_DEFAULT_COUNTRY || 'BR');
}
