import React from 'react';

const LoadingScreen: React.FC = () => {
    return (
        <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center overflow-hidden">
            {/* Neural Matrix Background */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#fbbf24_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
            </div>

            {/* Core Initialization Unit */}
            <div className="relative">
                {/* Hexagonal Rings */}
                <div className="absolute inset-0 -m-8 border-2 border-amber-500/10 rounded-full animate-ping duration-1000" />
                <div className="absolute inset-0 -m-12 border border-purple-500/5 rounded-full animate-pulse duration-2000" />

                {/* Main Hexagon Loader */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                    <div className="absolute inset-0 border-4 border-amber-500/20 rounded-[2rem] animate-spin-slow" />
                    <div className="absolute inset-2 border-4 border-t-amber-500 border-r-transparent border-b-transparent border-l-transparent rounded-[1.5rem] animate-spin" />

                    <svg className="w-12 h-12 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
            </div>

            {/* Diagnostics Overlay */}
            <div className="mt-12 text-center space-y-3 relative">
                <div className="h-px w-48 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent mx-auto" />

                <div className="flex flex-col items-center">
                    <span className="text-amber-500 font-black uppercase tracking-[0.6em] text-[10px] animate-pulse">
                        Establishing Secure Signal
                    </span>
                    <span className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[8px] mt-1">
                        Citadel Architectural Intelligence
                    </span>
                </div>

                <div className="flex items-center justify-center space-x-2">
                    <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" />
                </div>
            </div>

            {/* Bottom Security Protocol */}
            <div className="absolute bottom-12 flex items-center space-x-3 opacity-30">
                <div className="flex items-center space-x-2 border border-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">CITADEL_ACTIVE</span>
                </div>
                <div className="w-12 h-px bg-white/10" />
                <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">AES-256_ENCRYPTED</span>
            </div>
        </div>
    );
};

export default LoadingScreen;
