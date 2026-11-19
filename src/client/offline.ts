/**
 * True for the "local play only" build (VITE_OFFLINE=1), e.g. a copy hosted as a
 * static page with no game server behind it. Online features say so instead of
 * trying to connect.
 */
export const OFFLINE_BUILD = import.meta.env.VITE_OFFLINE === '1';
