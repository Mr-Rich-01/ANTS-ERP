/** Erros de domínio — mapeados para respostas HTTP nas Route Handlers / Server Actions. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Sem permissão para esta operação.') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Registo não encontrado.') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Dados inválidos.') {
    super(message, 'VALIDATION', 422);
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Conflito de estado.') {
    super(message, 'CONFLICT', 409);
  }
}
