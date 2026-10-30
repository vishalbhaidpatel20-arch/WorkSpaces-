import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

let socket = null;

/** One shared connection for the whole app, opened on first use. */
export function getSocket() {
  if (!socket) socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}

/**
 * Subscribe to live occupancy for one space.
 * @returns the latest reading, or null until the first event arrives.
 */
export function useSpaceOccupancy(spaceId, initial = null) {
  const [reading, setReading] = useState(initial);

  useEffect(() => {
    if (!spaceId) return;
    const s = getSocket();
    const onOccupancy = (r) => {
      if (Number(r.space_id) === Number(spaceId)) setReading(r);
    };
    s.emit('watch:space', spaceId);
    s.on('occupancy', onOccupancy);
    return () => {
      s.emit('unwatch:space', spaceId);
      s.off('occupancy', onOccupancy);
    };
  }, [spaceId]);

  return reading;
}

/**
 * Platform-wide monitor feed for the owner and admin dashboards.
 * Keeps the latest reading per space, plus a connection flag for the UI.
 */
export function useMonitorFeed({ onBooking, onAvailability } = {}) {
  const [bySpace, setBySpace] = useState({});
  const [connected, setConnected] = useState(false);
  const handlers = useRef({ onBooking, onAvailability });
  handlers.current = { onBooking, onAvailability };

  useEffect(() => {
    const s = getSocket();

    const join = () => { setConnected(true); s.emit('watch:monitor'); };
    const onOccupancy = (r) => setBySpace((prev) => ({ ...prev, [r.space_id]: r }));
    const onBookingEvt = (b) => handlers.current.onBooking?.(b);
    const onAvailabilityEvt = (a) => handlers.current.onAvailability?.(a);

    if (s.connected) join();
    s.on('connect', join);
    s.on('disconnect', () => setConnected(false));
    s.on('occupancy', onOccupancy);
    s.on('booking', onBookingEvt);
    s.on('availability', onAvailabilityEvt);

    return () => {
      s.off('connect', join);
      s.off('occupancy', onOccupancy);
      s.off('booking', onBookingEvt);
      s.off('availability', onAvailabilityEvt);
    };
  }, []);

  return { bySpace, connected };
}
