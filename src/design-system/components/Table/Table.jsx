/**
 * Table
 *
 * Low-level semantic table presentation primitive.
 */
import { createContext, useContext } from 'react';

const TableContext = createContext({});

export function Table({ children, className = '' }) {
  return (
    <table className={`w-full text-left text-sm ${className}`}>
      {children}
    </table>
  );
}

export function TableHeader({ children, className = '' }) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({ children, className = '' }) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className = '', ...rest }) {
  return <tr className={className} {...rest}>{children}</tr>;
}

export function TableHead({ children, className = '', ...rest }) {
  return <th scope="col" className={`px-4 py-3 font-medium text-neutral-600 ${className}`} {...rest}>{children}</th>;
}

export function TableCell({ children, className = '', ...rest }) {
  return <td className={`px-4 py-3 ${className}`} {...rest}>{children}</td>;
}

export function useTableContext() {
  return useContext(TableContext);
}

export default Table;
