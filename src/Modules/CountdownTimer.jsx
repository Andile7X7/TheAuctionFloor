import { useState, useEffect } from 'react';

const CountdownTimer = ({ closesAt, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!closesAt) return;

    const calculateTime = () => {
      const diff = new Date(closesAt) - new Date();
      if (diff <= 0) {
        setTimeLeft({ closed: true });
        onClose?.();
        return true; // Signal to stop
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft({
        closed: false,
        d,
        h,
        m,
        s,
        formatted: `${d}d : ${String(h).padStart(2, '0')}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`
      });
      return false;
    };

    const isClosed = calculateTime();
    if (isClosed) return;

    const interval = setInterval(() => {
      const closed = calculateTime();
      if (closed) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [closesAt, onClose]);

  if (!timeLeft) return null;

  if (timeLeft.closed) {
    return <span style={{ color: '#EF4444', fontWeight: 'bold' }}>Closed</span>;
  }

  return (
    <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
      {timeLeft.formatted}
    </span>
  );
};

export default CountdownTimer;