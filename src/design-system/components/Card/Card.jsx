/**
 * Card
 *
 * Container with consistent padding, radius, and shadow.
 */

function Card({ children, className = '', ...rest }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-6 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
