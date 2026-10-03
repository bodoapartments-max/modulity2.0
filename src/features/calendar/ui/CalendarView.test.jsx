import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CalendarView from './CalendarView.jsx';

const baseEvent = {
  recordId: 'rec-1',
  definitionId: 'cal-1',
  moduleId: 'mod-1',
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
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('renders month grid', () => {
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-10-15')} view="month" events={[]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('renders week view', () => {
    render(
      <BrowserRouter>
        <CalendarView currentDate={new Date('2026-10-15')} view="week" events={[]} loading={false} error={null} onEventClick={vi.fn()} />
      </BrowserRouter>,
    );
    expect(screen.getAllByText(/11/).length).toBeGreaterThan(0);
  });
});
