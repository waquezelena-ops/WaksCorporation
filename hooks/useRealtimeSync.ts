import { useEffect, useRef } from 'react';
import { GET_API_BASE_URL } from '../utils/apiUtils';

/**
 * Hook to synchronize client data with the database in real-time.
 * Connects to /api/realtime SSE endpoint, dispatches 'nxc-db-refresh' on change.
 *
 * Reliability improvements:
 * - API_BASE_URL resolved inside the effect (not at module load) so Capacitor / env changes work.
 * - Exponential backoff with NO permanent retry limit — reconnects indefinitely.
 * - Reconnects when the tab regains visibility (prevents stale data after device sleep).
 * - Cleans up properly on unmount.
 */
export const useRealtimeSync = () => {
    const eventSourceRef = useRef<EventSource | null>(null);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        const connect = () => {
            if (!mountedRef.current) return;

            // Resolve URL inside the effect so it picks up env changes correctly
            const API_BASE_URL = GET_API_BASE_URL();
            const url = `${API_BASE_URL}/api/realtime`;

            console.log('[Realtime] Connecting to SSE channel...');

            // Close any existing connection before opening a new one
            eventSourceRef.current?.close();

            const es = new EventSource(url);
            eventSourceRef.current = es;

            es.onopen = () => {
                console.log('[Realtime] Signal established.');
                retryCountRef.current = 0; // Reset backoff on successful connection
            };

            es.onmessage = (event) => {
                if (event.data === 'refresh') {
                    console.log('[Realtime] DB change detected — dispatching refresh signal.');
                    window.dispatchEvent(new CustomEvent('nxc-db-refresh'));
                }
            };

            es.onerror = () => {
                console.warn('[Realtime] Signal lost. Scheduling reconnect...');
                es.close();
                eventSourceRef.current = null;

                if (!mountedRef.current) return;

                // Exponential backoff: 2s, 4s, 8s, ... capped at 60s. No hard limit.
                retryCountRef.current += 1;
                const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 60000);
                console.log(`[Realtime] Reconnecting in ${delay / 1000}s (attempt ${retryCountRef.current})...`);
                retryTimeoutRef.current = setTimeout(connect, delay);
            };
        };

        // Reconnect when the tab becomes visible again (e.g. after device sleep)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const readyState = eventSourceRef.current?.readyState;
                // CLOSED = 2; reconnect if the connection dropped while tab was hidden
                if (readyState === undefined || readyState === EventSource.CLOSED) {
                    console.log('[Realtime] Tab regained focus — reconnecting SSE...');
                    retryCountRef.current = 0;
                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                    connect();
                }
            }
        };

        connect();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            mountedRef.current = false;
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            eventSourceRef.current?.close();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            console.log('[Realtime] Sync listener terminated.');
        };
    }, []); // Only runs once — the hook manages its own reconnection lifecycle
};
