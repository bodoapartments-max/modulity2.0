import { createContext, useContext } from 'react';

const FormFieldServicesContext = createContext(null);

export function FormFieldServicesProvider({ services, children }) {
  return <FormFieldServicesContext.Provider value={services || null}>{children}</FormFieldServicesContext.Provider>;
}

export function useFormFieldServices() {
  return useContext(FormFieldServicesContext);
}
