
import React from 'react';
import Modal from './Modal';

interface PartnershipModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PartnershipModal: React.FC<PartnershipModalProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = React.useState<'intro' | 'waiting' | 'success'>('intro');
    const calendarWindowRef = React.useRef<Window | null>(null);
    // Reset step when modal opens/closes
    React.useEffect(() => {
        if (isOpen) setStep('intro');
    }, [isOpen]);


    const handleScheduleMeeting = () => {
        const calendarUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Strategic+Partnership+Briefing&details=Agenda:+Discussing+potential+collaboration,+integrations,+and+sponsorship+tiers+with+WC+Esports.&add=emersonwaque@gmail.com";

        // Open in a popup window to encourage closing after save
        const width = 1000;
        const height = 800;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;

        const win = window.open(
            calendarUrl,
            'WCPartnershipUplink',
            `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
        );
        calendarWindowRef.current = win;

        setStep('waiting');
    };

    const handleConfirmSent = () => {
        if (calendarWindowRef.current) {
            calendarWindowRef.current.close();
        }
        setStep('success');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} zIndex={150} backdropClassName="bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" className="w-full max-w-lg">
            <div className="relative w-full max-w-lg bg-[#020617] border border-amber-500/20 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Background Decorations */}
                <div className="absolute top-[-50%] left-[-50%] w-full h-full bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-50%] right-[-50%] w-full h-full bg-purple-600/10 blur-[100px] rounded-full pointer-events-none" />

                <div className="relative p-8 text-center space-y-6">
                    {step === 'intro' && (
                        <>
                            <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.2)]">
                                <span className="text-3xl">🤝</span>
                            </div>

                            <div>
                                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">
                                    Strategic Alliance <span className="text-amber-500">Protocol</span>
                                </h2>
                                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                                    Signal received. The High Command is ready to receive your briefing.
                                    Schedule a secure uplink to discuss integration parameters.
                                </p>
                            </div>

                            <div className="space-y-3 pt-4">
                                <button
                                    onClick={handleScheduleMeeting}
                                    className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-black uppercase tracking-widest rounded-xl shadow-lg shadow-amber-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 border-t border-white/20"
                                >
                                    <span>Initialize Meeting Uplink</span>
                                </button>

                                <button
                                    onClick={onClose}
                                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold uppercase tracking-widest rounded-xl transition-all text-xs"
                                >
                                    Abort Sequence
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'waiting' && (
                        <div className="animate-in fade-in zoom-in duration-300">
                            <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.2)] animate-pulse mb-6">
                                <span className="text-3xl">📡</span>
                            </div>

                            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-4">
                                Uplink <span className="text-blue-500">Active</span>
                            </h2>

                            <p className="text-slate-400 text-sm font-medium leading-relaxed mb-8">
                                Secure channel open in external terminal. Please finalize the briefing schedule.
                            </p>

                            <button
                                onClick={handleConfirmSent}
                                className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all border-t border-white/20"
                            >
                                Transmission Complete
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.2)] mb-6">
                                <span className="text-3xl">✅</span>
                            </div>

                            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">
                                Link <span className="text-green-500">Established</span>
                            </h2>

                            <div className="space-y-4 text-slate-400 text-sm font-medium leading-relaxed">
                                <p>
                                    Greetings! We are honored to explore a potential alliance with you.
                                </p>
                                <p>
                                    The Waks Corporation is fully prepared to deploy resources and integrate your vision into our operations. We look forward to the briefing.
                                </p>
                            </div>

                            <div className="pt-8">
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest rounded-xl transition-all border border-white/10 hover:border-amber-500/50"
                                >
                                    Return to Base
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                            Secure Channel: emersonwaque@gmail.com
                        </p>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PartnershipModal;
