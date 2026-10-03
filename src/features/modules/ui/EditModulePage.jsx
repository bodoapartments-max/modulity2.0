import { useParams } from 'react-router-dom';
import ModuleDesigner from '../designer/ui/ModuleDesigner.jsx';

export default function EditModulePage() {
  const { moduleId } = useParams();
  return <ModuleDesigner moduleId={moduleId} />;
}
