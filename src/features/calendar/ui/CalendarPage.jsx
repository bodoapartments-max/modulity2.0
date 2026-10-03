import { useNavigate } from 'react-router-dom';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useCalendar } from '../hooks/useCalendar.js';
import CalendarView from './CalendarView.jsx';

export default function CalendarPage() {
  const { currentWorkspace, currentMembership } = useWorkspace();
  const navigate = useNavigate();
  const calendar = useCalendar({ workspace: currentWorkspace, membership: currentMembership });

  if (calendar.loadingDefinitions) return <PageContainer><LoadingState message="Loading calendars…" /></PageContainer>;

  const activeDefinitionIds = calendar.definitions.map((d) => d.definitionId);
  const allSelected = activeDefinitionIds.length > 0 && activeDefinitionIds.every((id) => calendar.selectedDefinitionIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      calendar.setSelectedDefinitionIds([]);
    } else {
      calendar.setSelectedDefinitionIds([...activeDefinitionIds]);
    }
  };

  const handleDayClick = (date) => {
    calendar.setCurrentDate(date);
    calendar.setView('day');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Calendar"
        description="Projected view of canonical Records across modules."
        action={
          <Button variant="secondary" onClick={() => navigate('/app/calendars/manage')}>
            Manage Calendars
          </Button>
        }
      />
      {calendar.definitionError && <Alert variant="error" className="mb-4">{calendar.definitionError}</Alert>}
      {calendar.definitions.length === 0 && !calendar.loadingDefinitions && (
        <Alert variant="info" className="mb-4">
          No active calendars. <button type="button" className="text-primary-600 underline" onClick={() => navigate('/app/calendars/manage')}>Create a CalendarDefinition</button> to begin.
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => calendar.navigate(-1)} aria-label="Previous period">←</Button>
          <Button size="sm" variant="secondary" onClick={calendar.goToday}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => calendar.navigate(1)} aria-label="Next period">→</Button>
          <span className="ml-2 text-sm font-medium text-neutral-700" aria-live="polite">
            {calendar.view === 'year'
              ? calendar.currentDate.getFullYear()
              : calendar.currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['year', 'month', 'week', 'day'].map((v) => (
            <button
              key={v}
              onClick={() => calendar.setView(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${calendar.view === v ? 'bg-primary-100 text-primary-700' : 'text-neutral-600 hover:bg-neutral-100'}`}
              type="button"
              aria-pressed={calendar.view === v}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {calendar.definitions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className={`rounded-full px-3 py-1 text-sm font-medium ${allSelected ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'bg-neutral-100 text-neutral-600'}`}
            aria-pressed={allSelected}
          >
            All
          </button>
          {calendar.definitions.map((def) => {
            const selected = calendar.selectedDefinitionIds.includes(def.definitionId);
            return (
              <button
                key={def.definitionId}
                type="button"
                onClick={() => calendar.setSelectedDefinitionIds((ids) => ids.includes(def.definitionId) ? ids.filter((id) => id !== def.definitionId) : [...ids, def.definitionId])}
                className={`rounded-full px-3 py-1 text-sm font-medium ${selected ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'bg-neutral-100 text-neutral-600'}`}
                aria-pressed={selected}
              >
                {def.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-[400px] rounded-xl border border-neutral-200 bg-white p-4">
        {calendar.selectedDefinitionIds.length === 0 && !calendar.loadingEvents ? (
          <p className="text-sm text-neutral-500">No calendars selected.</p>
        ) : (
          <CalendarView
            currentDate={calendar.currentDate}
            view={calendar.view}
            events={calendar.events}
            loading={calendar.loadingEvents}
            error={calendar.eventsError}
            onEventClick={(event) => navigate(`/app/records/${event.recordId}`)}
            onDayClick={handleDayClick}
          />
        )}
      </div>
    </PageContainer>
  );
}
