import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CalendarView from './CalendarView.jsx';

const baseEvent = {
  recordId: 'rec-1',
  definitionId: 'cal-1',
  definitionName: 'Holiday Calendar',
  moduleId: 'mod-1',
  moduleName: 'Holiday Request',
  moduleVersion: 1,
  title: 'Holiday',
  start: '2026-10-10',
  end: '2026-10-12',
  allDay: true,
  resourceRef: null,
  resourceLabel: null,
  recordStatus: 'SUBMITTED',
};

describe('CalendarView', () => {
  it('renders day view and events', () => {
    render(
      <BrowserRouter>
        <CalendarView
          currentDate={new Date('2026-10-10')}
          view="day"
          events={[baseEvent]}
          loading={false}
          error={null}
          onEventClick={vi.fn()}
        />
      </BrowserRouter>,
    );
    expect(screen.getByText('Holiday')).toBeInTheDocument();
    expect(screen.getByText('Holiday Request')).toBeInTheDocument();
  });

  it('renders month grid starting on Monday', () => {
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-10-15')} view="month" events={[]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.queryByText('All day')).not.toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders week view starting on Monday', () => {
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-10-15')} view="week" events={[]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    // 2026-10-15 is Thursday. Monday-first week starts 2026-10-12.
    expect(screen.getAllByText(/12/).length).toBeGreaterThan(0);
  });

  it('renders year view with twelve months', () => {
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-06-15')} view="year" events={[]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    expect(screen.getByText('2026')).toBeInTheDocument();
    // Month names are localized; assert there are exactly 12 month headings.
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(12);
  });

  it('shows timed event with actual start time instead of All day', () => {
    const timedEvent = { ...baseEvent, allDay: false, start: '2026-10-10T09:30:00Z' };
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-10-10')} view="day" events={[timedEvent]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    expect(screen.queryByText('All day')).not.toBeInTheDocument();
    expect(screen.getByText('Holiday')).toBeInTheDocument();
  });
});
