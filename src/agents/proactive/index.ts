/**
 * Proactive assistance module - calendar monitoring and contextual intelligence.
 */

export {
  type CalendarEvent,
  CalendarMonitor,
  type CalendarMonitorOptions,
  createCalendarMonitor,
  GoogleCalendarService,
  isCalendarMonitorAvailable,
  type MeetingContext,
  resetCalendarMonitor,
} from "./calendar-monitor.js";
