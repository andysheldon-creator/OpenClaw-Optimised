/**
 * Utility to calculate human-friendly relative time descriptions.
 */
export function getRelativeTimeDescription(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  const getDayPart = (d: Date) => {
    const hr = d.getHours();
    if (hr >= 6 && hr < 13) return "in the morning";
    if (hr >= 13 && hr < 20) return "in the afternoon";
    if (hr >= 20 || hr < 1) return "at night";
    return "in the early morning";
  };

  if (diffSec < 60) return "just a moment ago";
  if (diffMin < 60) {
    if (diffMin === 1) return "a minute ago";
    if (diffMin < 5) return "a few minutes ago";
    return `about ${diffMin} minutes ago`;
  }

  if (diffHr < 24) {
    if (diffHr === 1) return "almost 1h ago";
    if (diffHr < 3) return `less than ${diffHr + 1}h ago`;
    if (diffHr < 6) return "a few hours ago";
    return `this ${getDayPart(date).replace("in the ", "").replace("at ", "")}`;
  }

  if (diffDays === 1) return `yesterday ${getDayPart(date)}`;
  if (diffDays === 2) return `the day before yesterday ${getDayPart(date)}`;
  if (diffDays < 7) return `${diffDays} days ago ${getDayPart(date)}`;
  if (diffDays < 14) return "last week";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  if (diffMonths < 12) {
    if (diffMonths === 1) return "1 month ago";
    if (diffMonths < 11) return `${diffMonths} months ago`;
    return "almost a year ago";
  }

  if (diffYears === 1) {
    const monthsExtra = diffMonths % 12;
    if (monthsExtra > 9) return "almost 2 years ago";
    return "a year and a few months ago";
  }

  if (diffYears < 5) {
    const monthsExtra = diffMonths % 12;
    if (monthsExtra > 9) return `almost ${diffYears + 1} years ago`;
    return `${diffYears} years ago${monthsExtra >= 1 ? " or so" : ""}`;
  }

  return `about ${diffYears} years ago`;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
