import winston from 'winston';

// Mapping for specific time zones
const timeZoneAbbreviations = {
  'Asia/Kolkata': 'IST',
  // Add more mappings if needed
};

function getTimestampWithTimeZone() {
  const now = new Date();

  // Get ISO date string with milliseconds
  const iso = now.toISOString(); // "2025-05-20T07:10:44.725Z"
  const [date, timeWithMs] = iso.split('T');
  const [time, msAndZone] = timeWithMs.split('.');
  const milliseconds = msAndZone.slice(0, 2); // Keep only first two digits

  const tz = 'Asia/Kolkata';
  const abbreviation = timeZoneAbbreviations[tz] || 'IST';

  // Convert to local time in desired time zone
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type)?.value;
  const formatted = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}.${milliseconds} ${abbreviation}`;

  return formatted;
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.printf(
      ({ level, message }) => `[${getTimestampWithTimeZone()}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

export default logger;