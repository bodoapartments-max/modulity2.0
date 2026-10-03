/**
 * Pagination
 *
 * Generic pagination controls. Feature code supplies current state and callbacks.
 */
import Button from '../Button/Button.jsx';

export default function Pagination({
  currentPage = 1,
  pageCount,
  hasPrevious = false,
  hasNext = false,
  pageInfo,
  onPrevious,
  onNext,
  className = '',
}) {
  const info = pageInfo ?? `Page ${currentPage}${pageCount ? ` of ${pageCount}` : ''}`;
  const previousDisabled = !hasPrevious || !onPrevious;
  const nextDisabled = !hasNext || !onNext;
  return (
    <nav
      aria-label="Pagination"
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <span className="text-sm text-neutral-600" aria-live="polite">
        {info}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={nextDisabled}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}
