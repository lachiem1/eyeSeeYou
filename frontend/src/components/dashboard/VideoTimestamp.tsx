'use client';

interface VideoTimestampProps {
  timestamp: string | null;
}

export default function VideoTimestamp({ timestamp }: VideoTimestampProps) {
  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);

      // Format: "26 Dec 2025, 10:34 am"
      const day = date.getDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();

      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12

      return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch (error) {
      return 'Unknown time';
    }
  };

  if (!timestamp) {
    return null;
  }

  return (
    <div className="mt-4 text-center">
      <p className="text-text-secondary text-sm mb-1">Detected</p>
      <p className="text-text-primary font-semibold">{formatTimestamp(timestamp)}</p>
    </div>
  );
}
