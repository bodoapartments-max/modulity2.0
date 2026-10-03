import { useState } from 'react';
import {
  addDays,
  daysInMonth,
  formatEventTime,
  getMonthGridDays,
  getYearMonthDates,
  isInRange,
  sameDay,
  sameMonth,
  startOfWeekMondayFirst,
  WEEKDAYS_MONDAY_FIRST,
} from '../utils/calendarDateUtils.js';

const CALENDAR_PALETTE = [
  'bg-primary-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-lime-500',
];

function colorForDefinition(definitionId) {
  let hash = 0;
  for (let i = 0; i < definitionId.length; i += 1) {
    hash = definitionId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CALENDAR_PALETTE[Math.abs(hash) % CALENDAR_PALETTE.length];
}

function EventChip({ event, compact = false, onClick }) {
  const time = formatEventTime(event);
  const label = event.allDay || !time
    ? `${event.moduleName || event.definitionName || 'Event'} · ${event.title}`
    : `${time} ${event.title}`;
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onClick(event)}
        title={label}
        className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white bg-primary-500 hover:bg-primary-600"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-left hover:bg-neutral-50"
    >
      {time && (
        <span className="rounded bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
          {time}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900">{event.title}</p>
        {event.moduleName && <p className="truncate text-xs text-neutral-500">{event.moduleName}</p>}
      </div>
      {event.resourceLabel && <span className="ml-auto hidden shrink-0 text-xs text-neutral-500 sm:inline">{event.resourceLabel}</span>}
    </button>
  );
}

function EventPill({ event }) {
  const colorClass = colorForDefinition(event.definitionId);
  return (
    <span
      title={`${event.moduleName || event.definitionName || 'Event'} · ${event.title}`}
      className={`inline-block h-1.5 w-4 rounded-full ${colorClass}`}
    />
  );
}

function YearMonthMini({ monthDate, events, onDayClick, onEventClick }) {
  const days = getMonthGridDays(monthDate);
  const monthName = monthDate.toLocaleDateString(undefined, { month: 'short' });
  const [hoveredDay, setHoveredDay] = useState(null);
  const isLeap = new Date(monthDate.getFullYear(), 1, 29).getMonth() === 1;
  const maxDay = monthDate.getMonth() === 1 && isLeap ? 29 : daysInMonth(monthDate);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-neutral-900">{monthName}</h3>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_MONDAY_FIRST.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase text-neutral-500">{d[0]}</div>
        ))}
        {days.map((day) => {
          if (day.getMonth() !== monthDate.getMonth() || day.getDate() > maxDay) {
            return <div key={day.toISOString()} className="h-6" />;
          }
          const dayEvents = events.filter((e) => isInRange(e, day));
          const isToday = sameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className="relative h-6 cursor-pointer rounded hover:bg-neutral-100 focus-within:bg-neutral-100"
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              onFocus={() => setHoveredDay(day)}
              onBlur={() => setHoveredDay(null)}
              onClick={() => onDayClick(day)}
              role="button"
              tabIndex={0}
              aria-label={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            >
              <div className={`mx-auto flex h-5 w-5 items-center justify-center text-[10px] font-medium ${isToday ? 'rounded-full bg-primary-600 text-white' : 'text-neutral-700'}`}>
                {day.getDate()}
              </div>
              {dayEvents.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 px-1">
                  {dayEvents.slice(0, 3).map((event) => <EventPill key={`${event.definitionId}:${event.recordId}`} event={event} />)}
                  {dayEvents.length > 3 && <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />}
                </div>
              )}
              {hoveredDay && sameDay(hoveredDay, day) && dayEvents.length > 0 && (
                <div className="absolute bottom-6 left-1/2 z-10 w-56 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
                  <p className="text-xs font-medium text-neutral-900">{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  <div className="mt-1 max-h-32 space-y-1 overflow-auto">
                    {dayEvents.slice(0, 5).map((event) => (
                      <button
                        key={`${event.definitionId}:${event.recordId}`}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        className="block w-full truncate text-left text-xs text-neutral-700 hover:text-primary-600"
                      >
                        {event.moduleName || event.definitionName || 'Event'} · {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 5 && <p className="text-xs text-neutral-500">+ {dayEvents.length - 5} more</p>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                    className="mt-2 text-xs font-medium text-primary-600 hover:underline"
                  >
                    Open day
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({ currentDate, events, onDayClick, onEventClick }) {
  const months = getYearMonthDates(currentDate.getFullYear());
  return (
    <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((monthDate) => (
        <YearMonthMini
          key={monthDate.getMonth()}
          monthDate={monthDate}
          events={events}
          onDayClick={onDayClick}
          onEventClick={onEventClick}
        />
      ))}
    </div>
  );
}

function MonthGrid({ currentDate, events, onEventClick }) {
  const days = getMonthGridDays(currentDate);
  return (
    <div className="grid flex-1 grid-cols-7 gap-px border border-neutral-200 bg-neutral-200">
      {WEEKDAYS_MONDAY_FIRST.map((d) => (
        <div key={d} className="bg-neutral-50 p-2 text-center text-xs font-semibold uppercase text-neutral-500">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = events.filter((e) => isInRange(e, day));
        const inMonth = sameMonth(day, currentDate);
        return (
          <div key={day.toISOString()} className={`min-h-24 bg-white p-2 ${inMonth ? '' : 'bg-neutral-50 text-neutral-400'}`}>
            <span className={`text-sm font-medium ${sameDay(day, new Date()) ? 'rounded-full bg-primary-600 px-2 py-0.5 text-white' : 'text-neutral-700'}`}>
              {day.getDate()}
            </span>
            <div className="mt-1 space-y-1">
              {dayEvents.map((event) => (
                <EventChip key={`${event.definitionId}:${event.recordId}`} event={event} compact onClick={onEventClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ currentDate, events, onEventClick }) {
  const start = startOfWeekMondayFirst(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid flex-1 grid-cols-7 gap-px border border-neutral-200 bg-neutral-200">
      {days.map((day) => (
        <div key={day.toISOString()} className="bg-white p-2">
          <div className={`text-center text-sm font-semibold ${sameDay(day, new Date()) ? 'text-primary-600' : 'text-neutral-700'}`}>
            {day.toLocaleDateString(undefined, { weekday: 'short' })} {day.getDate()}
          </div>
          <div className="mt-2 space-y-1">
            {events.filter((e) => isInRange(e, day)).map((event) => (
              <EventChip key={`${event.definitionId}:${event.recordId}`} event={event} compact onClick={onEventClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayView({ currentDate, events, onEventClick }) {
  const dayEvents = events.filter((e) => isInRange(e, currentDate));
  return (
    <div className="flex-1 space-y-2">
      <h3 className="text-lg font-semibold text-neutral-800">
        {currentDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </h3>
      {dayEvents.length === 0 && <p className="text-sm text-neutral-500">No events.</p>}
      {dayEvents.map((event) => (
        <EventChip key={`${event.definitionId}:${event.recordId}`} event={event} onClick={onEventClick} />
      ))}
    </div>
  );
}

export default function CalendarView({ currentDate, view, events, loading, error, onEventClick, onDayClick }) {
  const title = view === 'year'
    ? currentDate.getFullYear().toString()
    : currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  if (loading) return <p className="text-sm text-neutral-500">Loading calendar…</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-neutral-900">{view === 'day' ? currentDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : title}</h2>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {view === 'year' && <YearGrid currentDate={currentDate} events={events} onDayClick={onDayClick || (() => {})} onEventClick={onEventClick} />}
      {view === 'month' && <MonthGrid currentDate={currentDate} events={events} onEventClick={onEventClick} />}
      {view === 'week' && <WeekGrid currentDate={currentDate} events={events} onEventClick={onEventClick} />}
      {view === 'day' && <DayView currentDate={currentDate} events={events} onEventClick={onEventClick} />}
    </div>
  );
}
