/**
 * MobileDrawer
 *
 * Wraps the Sidebar in a slide-out drawer for small screens.
 */

import Drawer from '../../design-system/components/Drawer/Drawer.jsx';
import Sidebar from './Sidebar.jsx';

function MobileDrawer({ open, onClose }) {
  return (
    <Drawer open={open} onClose={onClose} anchor="left" className="bg-white">
      <div className="p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="h-6 w-6 rounded bg-primary-600" aria-hidden="true" />
          <span className="text-lg font-semibold text-neutral-900">Modulity</span>
        </div>
        <Sidebar onNavigate={onClose} />
      </div>
    </Drawer>
  );
}

export default MobileDrawer;
