import { useState } from 'react';
import Alert from '../../../../design-system/components/Alert/Alert.jsx';
import Card from '../../../../design-system/components/Card/Card.jsx';
import { FormRenderer } from '../../../../modules/forms/FormRenderer.jsx';

export default function DesignerPreview({ schema, workspaceId, valid, fieldServices }) {
  const [message, setMessage] = useState(null);
  return <Card><h2 className="text-lg font-semibold text-neutral-900">Live Preview</h2><p className="mt-1 text-sm text-neutral-600">Rendered by the production FormRenderer. Preview submission creates no Record.</p>{!valid ? <Alert variant="warning" className="mt-4">Fix Designer validation errors to preview this form.</Alert> : <div className="mt-4">{message && <Alert variant="success" className="mb-4">{message}</Alert>}<FormRenderer schema={schema} workspaceId={workspaceId} submitLabel="Test Preview" onSubmit={() => setMessage('Preview validated successfully. No canonical Record was created.')} fieldServices={fieldServices} /></div>}</Card>;
}
