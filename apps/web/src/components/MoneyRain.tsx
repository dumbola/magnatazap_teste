'use client';

import React, { useEffect, useRef } from 'react';

const MoneyRain = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- Configuration ---
        const particleCount = 45; // Number of items falling

        // Asset Strings (SVGs)
        // 1. Banknote (Cédula) - Minimalist Green Bill
        const billSvg = encodeURIComponent(`
            <svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="38" height="18" rx="2" fill="rgba(0, 255, 100, 0.1)" stroke="#00e676" stroke-width="1.5"/>
                <circle cx="20" cy="10" r="4" stroke="#00e676" stroke-width="1.5" fill="none"/>
                <circle cx="5" cy="5" r="1" fill="#00e676"/>
                <circle cx="35" cy="15" r="1" fill="#00e676"/>
            </svg>
        `);

        // 2. Dollar Sign (Cifrão) - Stylish
        const signSvg = encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1V23" stroke="#00e676" stroke-width="2" stroke-linecap="round"/>
                <path d="M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3688 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="#00e676" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `);

        const billImg = new Image();
        billImg.src = `data:image/svg+xml;utf8,${billSvg}`;

        const signImg = new Image();
        signImg.src = `data:image/svg+xml;utf8,${signSvg}`;

        // Particle System
        interface Particle {
            x: number;
            y: number;
            speed: number;
            type: 'bill' | 'sign';
            rotation: number;
            rotationSpeed: number;
            scale: number;
            opacity: number;
            sway: number; // For horizontal movement
            swayOffset: number;
        }

        let particles: Particle[] = [];

        const initParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(createParticle(true)); // Randomize Y initially
            }
        };

        const createParticle = (randomY = false): Particle => ({
            x: Math.random() * canvas.width,
            y: randomY ? Math.random() * canvas.height : -50,
            speed: Math.random() * 1.5 + 0.5, // 0.5 to 2.0
            type: Math.random() > 0.6 ? 'bill' : 'sign', // More bills than signs? or opposite.
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 2,
            scale: Math.random() * 0.5 + 0.5, // 0.5 to 1.0
            opacity: Math.random() * 0.3 + 0.1, // 0.1 to 0.4 (Subtle)
            sway: Math.random() * 0.5,
            swayOffset: Math.random() * Math.PI * 2
        });

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear frame

            particles.forEach((p, index) => {
                ctx.save();

                // Physics Update
                p.y += p.speed;
                p.rotation += p.rotationSpeed;
                p.x += Math.sin(p.swayOffset) * p.sway;
                p.swayOffset += 0.02;

                // Reset logic
                if (p.y > canvas.height + 50) {
                    particles[index] = createParticle();
                }

                // Drawing
                ctx.globalAlpha = p.opacity;
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.scale(p.scale, p.scale);

                if (p.type === 'bill') {
                    ctx.drawImage(billImg, -20, -10, 40, 20); // Center around 0,0
                } else {
                    ctx.drawImage(signImg, -12, -12, 24, 24);
                }

                ctx.restore();
            });

            requestAnimationFrame(draw);
        };

        // Wait for images to load (optional but safer)
        billImg.onload = () => {
            // Start loop only after at least one loads, or just start. 
            // RequestAnimationFrame handles partials usually fine.
        };

        const animationId = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0"
            style={{ filter: 'drop-shadow(0 0 5px rgba(0,230,118,0.2))' }} // Extra glow
        />
    );
};

export default MoneyRain;
