function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(event, date) {
  const start = new Date(event.start);
  let end = event.end ? new Date(event.end) : start;
  // For all-day end dates stored as inclusive date, treat as end of that day
  if (event.allDay && event.end && /^\d{4}-\d{2}-\d{2}$/.test(event.end)) {
    end = new Date(`${event.end}T23:59:59`);
  }
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  return start <= dayEnd && end >= dayStart;
}

function formatEventTime(event) {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  return start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MonthGrid({ currentDate, events, onEventClick }) {
  const start = startOfMonth(currentDate);
  const firstDay = start.getDay();
  const days = [];
  const pointer = addDays(start, -firstDay);
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(pointer, i));
  }

  return (
    <div className="grid flex-1 grid-cols-7 gap-px border border-neutral-200 bg-neutral-200">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="bg-neutral-50 p-2 text-center text-xs font-semibold uppercase text-neutral-500">
          {d}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = events.filter((e) => isInRange(e, day));
        const inMonth = day.getMonth() === currentDate.getMonth();
        return (
          <div key={day.toISOString()} className={`min-h-24 bg-white p-2 ${inMonth ? '' : 'bg-neutral-50 text-neutral-400'}`}>
            <span className={`text-sm font-medium ${sameDay(day, new Date()) ? 'rounded-full bg-primary-600 px-2 py-0.5 text-white' : 'text-neutral-700'}`}>
              {day.getDate()}
            </span>
            <div className="mt-1 space-y-1">
              {dayEvents.map((event) => (
                <button
                  key={event.recordId}
                  onClick={() => onEventClick(event)}
                  className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white bg-primary-500 hover:bg-primary-600"
                  title={event.title}
                  type="button"
                >
                  {formatEventTime(event)} {event.title}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({ currentDate, events, onEventClick }) {
  const start = addDays(currentDate, -currentDate.getDay());
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
              <button
                key={event.recordId}
                onClick={() => onEventClick(event)}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-xs font-medium text-white bg-primary-500 hover:bg-primary-600"
                title={event.title}
                type="button"
              >
                {formatEventTime(event)} {event.title}
              </button>
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
        <button
          key={event.recordId}
          onClick={() => onEventClick(event)}
          className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left hover:bg-neutral-50"
          type="button"
        >
          <span className="rounded bg-primary-100 px-2 py-1 text-xs font-medium text-primary-700">
            {formatEventTime(event)}
          </span>
          <span className="font-medium text-neutral-900">{event.title}</span>
          {event.resourceLabel && <span className="ml-auto text-sm text-neutral-500">{event.resourceLabel}</span>}
        </button>
      ))}
    </div>
  );
}

export default function CalendarView({ currentDate, view, events, loading, error, onEventClick }) {
  const title = currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  if (loading) return <p className="text-sm text-neutral-500">Loading calendar…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-neutral-900">{view === 'day' ? currentDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : title}</h2>
      </div>
      {view === 'month' && <MonthGrid currentDate={currentDate} events={events} onEventClick={onEventClick} />}
      {view === 'week' && <WeekGrid currentDate={currentDate} events={events} onEventClick={onEventClick} />}
      {view === 'day' && <DayView currentDate={currentDate} events={events} onEventClick={onEventClick} />}
    </div>
  );
}
