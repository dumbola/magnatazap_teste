import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // Deep Luxury Blacks
                'onyx': '#0a0a0a',
                'midnight': '#050505',

                // Neon Green (Money/Success)
                'neon-green': {
                    DEFAULT: '#00e676',
                    dark: '#00c853',
                    light: '#69f0ae',
                },

                // Gold/Bronze Premium Accents
                'gold': {
                    DEFAULT: '#ffd700',
                    dark: '#b8860b',
                    light: '#ffec8b',
                },
                'bronze': {
                    DEFAULT: '#cd7f32',
                    dark: '#8b4513',
                    light: '#daa520',
                },

                // Semantic Colors (Maintain compatibility)
                background: "#09090b",
                surface: "#18181b",
                border: "#27272a",
                primary: "#00e676",
                "primary-dark": "#00a856",
                text: {
                    main: "#e4e4e7",
                    muted: "#a1a1aa",
                },
                danger: "#ef4444",
                success: "#00e676",

                // WhatsApp
                whatsapp: {
                    bg: "#0b141a",
                    sent: "#005c4b",
                    recv: "#202c33",
                    header: "#202c33"
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['"Space Grotesk"', '"Outfit"', 'system-ui', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'monospace'],
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'float-slow': 'float 8s ease-in-out infinite',
                'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
                'shimmer': 'shimmer 3s linear infinite',
                'slide-in-right': 'slide-in-right 0.3s ease-out',
                'fade-in': 'fade-in 0.5s ease-out',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px) translateX(0px)' },
                    '50%': { transform: 'translateY(-20px) translateX(10px)' },
                },
                'pulse-glow': {
                    '0%, 100%': { opacity: '0.5', boxShadow: '0 0 20px rgba(0, 230, 118, 0.3)' },
                    '50%': { opacity: '1', boxShadow: '0 0 40px rgba(0, 230, 118, 0.6)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                'slide-in-right': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
            boxShadow: {
                'glow-sm': '0 0 10px rgba(0, 230, 118, 0.3)',
                'glow': '0 0 20px rgba(0, 230, 118, 0.4)',
                'glow-lg': '0 0 40px rgba(0, 230, 118, 0.5)',
                'gold-glow': '0 0 30px rgba(255, 215, 0, 0.3)',
                'inner-glow': 'inset 0 0 20px rgba(0, 230, 118, 0.1)',
            },
        },
    },
    plugins: [],
};

export default config;
