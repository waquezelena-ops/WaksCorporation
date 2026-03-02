import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose?: () => void;
    children: React.ReactNode;
    className?: string;
    backdropClassName?: string;
    zIndex?: number;
    closeOnBackdrop?: boolean;
}

/**
 * Modal - A reusable portal-based modal wrapper.
 *
 * Uses ReactDOM.createPortal to render into document.body, ensuring
 * the modal is always fixed to the viewport and never affected by
 * CSS transforms or overflow:hidden on parent elements.
 */
const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    children,
    className = '',
    backdropClassName = '',
    zIndex = 200,
    closeOnBackdrop = true,
}) => {
    // Lock body scroll while modal is open (shared counter for nested modals)
    useEffect(() => {
        if (isOpen) {
            // Increment modal count
            const currentCount = parseInt(document.body.dataset.modalCount || '0', 10);
            const newCount = currentCount + 1;
            document.body.dataset.modalCount = newCount.toString();

            // Lock scroll if this is the first modal
            if (newCount === 1) {
                document.body.style.overflow = 'hidden';
            }

            return () => {
                // Decrement modal count
                const prevCount = parseInt(document.body.dataset.modalCount || '1', 10);
                const nextCount = Math.max(0, prevCount - 1);
                document.body.dataset.modalCount = nextCount.toString();

                // Unlock scroll if this was the last modal
                if (nextCount === 0) {
                    document.body.style.overflow = '';
                }
            };
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleBackdropClick = () => {
        if (closeOnBackdrop && onClose) onClose();
    };

    return ReactDOM.createPortal(
        <div
            style={{ zIndex }}
            className={`fixed inset-0 flex items-center justify-center p-4 backdrop-blur-md bg-black/60 transition-all duration-300 animate-in fade-in ${backdropClassName}`}
            onClick={handleBackdropClick}
        >
            <div
                className={`relative z-50 animate-in zoom-in-95 duration-300 ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>,
        document.body
    );
};

export default Modal;
