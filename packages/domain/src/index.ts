// Camada de domínio do ANTS ERP — lógica de negócio reutilizável (web + worker).
// Cada serviço recebe um RequestContext (derivado da sessão) e impõe o isolamento
// multiempresa + permissões no servidor. Os serviços por módulo entram nas fases seguintes.
export * from './context';
export * from './errors';
export * from './permissions';
export * from './audit';
export * from './auth';
export * from './admin';
export * from './customers';
export * from './suppliers';
