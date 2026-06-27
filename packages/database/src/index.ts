export * from '@prisma/client';
export { prisma } from './client';
export { scopeArgs, COMPANY_SCOPED } from './tenant-scope';
export { forCompany, forContext, type AuditableContext } from './tenant';
