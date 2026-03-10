'use client';

export function BackgroundEffects() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            {/* Radial Gradient Base */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neon-green/5 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-gold/3 rounded-full blur-[120px]" />

            {/* Money Symbols Floating */}
            <div className="absolute top-[10%] left-[15%] money-symbol">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-neon-green/10">
                    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="24" fill="currentColor" fontWeight="bold">$</text>
                </svg>
            </div>

            <div className="absolute top-[60%] right-[20%] money-symbol" style={{ animationDelay: '2s' }}>
                <svg width="35" height="35" viewBox="0 0 24 24" fill="none" className="text-gold/10">
                    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="22" fill="currentColor" fontWeight="bold">R$</text>
                </svg>
            </div>

            <div className="absolute bottom-[20%] left-[25%] money-symbol" style={{ animationDelay: '4s' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-neon-green/8">
                    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="20" fill="currentColor" fontWeight="bold">$</text>
                </svg>
            </div>

            <div className="absolute top-[30%] right-[10%] money-symbol" style={{ animationDelay: '6s' }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" className="text-gold/8">
                    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="23" fill="currentColor" fontWeight="bold">₿</text>
                </svg>
            </div>

            {/* Network Nodes (Abstract) */}
            <div className="absolute top-[45%] left-[8%] w-2 h-2 bg-neon-green/20 rounded-full blur-sm animate-pulse" />
            <div className="absolute top-[25%] right-[30%] w-3 h-3 bg-gold/15 rounded-full blur-sm animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-[35%] right-[15%] w-2 h-2 bg-neon-green/15 rounded-full blur-sm animate-pulse" style={{ animationDelay: '3s' }} />

            {/* Grid Pattern (Subtle) */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(0, 230, 118, 0.1) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 230, 118, 0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '50px 50px',
                }}
            />
        </div>
    );
}
