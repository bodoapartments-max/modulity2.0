/**
 * PageContainer
 *
 * Consistent outer page wrapper with responsive padding and max width.
 */

function PageContainer({ children, className = '', ...rest }) {
  return (
    <div
      className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export default PageContainer;
