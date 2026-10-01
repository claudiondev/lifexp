import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';

/** O instante atual, reavaliado a cada minuto (para "hoje" e a linha de agora). */
export function useNow(): DateTime {
  const [now, setNow] = useState(() => DateTime.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
