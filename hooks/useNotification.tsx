import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { sileo, Toaster } from 'sileo';
import { useTheme } from './useTheme';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationContextType {
    showNotification: (notification: { message: string, type: NotificationType, title?: string }) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { theme } = useTheme();
    const showNotification = useCallback(({ message, type, title }: { message: string, type: NotificationType, title?: string }) => {
        const config = {
            title: title || type.toUpperCase(),
            description: message,
        };

        switch (type) {
            case 'success':
                sileo.success(config);
                break;
            case 'error':
                sileo.error(config);
                break;
            case 'warning':
                sileo.warning(config);
                break;
            case 'info':
            default:
                sileo.info(config);
                break;
        }
    }, []);

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            <Toaster theme={theme} />
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
