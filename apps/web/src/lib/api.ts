const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://178.156.166.139:4000';

export const API_URL = BASE_URL;

export const api = {
    get: async <T = any>(endpoint: string) => {
        const res = await fetch(`${BASE_URL}${endpoint}`);
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json() as Promise<T>;
    },

    post: async <T = any>(endpoint: string, body: any) => {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json() as Promise<T>;
    },

    patch: async <T = any>(endpoint: string, body: any) => {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json() as Promise<T>;
    },

    delete: async <T = any>(endpoint: string) => {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json() as Promise<T>;
    }
};
