/**
 * useRecordPagination — shared cursor-stack pagination for Record lists.
 *
 * The query service is cursor-based (startAfter), so "Previous" requires
 * remembering which cursor loaded each page. `cursorStack[i]` holds the
 * cursor used to load page i+2; page 1 is always loaded with `null`.
 */
import { useCallback, useState } from 'react';

export function useRecordPagination(loadPage) {
  const [cursorStack, setCursorStack] = useState([]);
  const page = cursorStack.length + 1;

  const goNext = useCallback(async (nextCursor) => {
    setCursorStack((stack) => [...stack, nextCursor]);
    await loadPage(nextCursor);
  }, [loadPage]);

  const goPrevious = useCallback(async () => {
    const previous = cursorStack.slice(0, -1);
    setCursorStack(previous);
    await loadPage(previous[previous.length - 1] ?? null);
  }, [cursorStack, loadPage]);

  const reset = useCallback(() => setCursorStack([]), []);

  return { page, hasPrevious: page > 1, goNext, goPrevious, reset };
}
