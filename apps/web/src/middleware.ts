import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value;

    // Helper to decode JWT payload safely
    const getRole = (t: string) => {
        try {
            const payload = JSON.parse(atob(t.split('.')[1]));
            return payload.role;
        } catch (e) { return null; }
    };

    // 1. Protect Dashboard (User)
    if (request.nextUrl.pathname.startsWith('/dashboard')) {
        if (!token) return NextResponse.redirect(new URL('/login', request.url));

        // Optional: Redirect Admin to Admin Panel if they try to access User Dashboard
        // const role = getRole(token);
        // if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }

    // 2. Protect Admin Panel
    if (request.nextUrl.pathname.startsWith('/admin')) {
        // Allow login page
        if (request.nextUrl.pathname === '/admin/login') return NextResponse.next();

        if (!token) return NextResponse.redirect(new URL('/admin/login', request.url));

        const role = getRole(token);
        if (role !== 'ADMIN') {
            // Not authorized, redirect to user dashboard or login
            return NextResponse.redirect(new URL('/dashboard/sender', request.url));
        }
    }

    // 3. Root Redirect
    if (request.nextUrl.pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/admin/:path*', '/'],
};
