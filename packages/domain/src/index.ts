// Camada de domínio do ANTS ERP — lógica de negócio reutilizável (web + worker).
// Cada serviço recebe um RequestContext (derivado da sessão) e impõe o isolamento
// multiempresa + permissões no servidor. Os serviços por módulo entram nas fases seguintes.
export * from './context';
export * from './errors';
export * from './permissions';
export * from './audit';
export * from './auth';
export * from './admin';
export * from './company-profile';
export * from './customers';
export * from './suppliers';
export * from './products';
export * from './stock';
export * from './stock-counts';
export * from './invoices';
export * from './commercial-documents';
export * from './purchases';
export * from './treasury';
export * from './accounting';
export * from './inventory-regularization';
export * from './reversals';
export * from './reports';
