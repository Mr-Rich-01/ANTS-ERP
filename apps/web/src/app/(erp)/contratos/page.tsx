import { FutureModuleNotice } from '@/components/shell/FutureModuleNotice';

export default function ContratosPage() {
  return (
    <FutureModuleNotice
      title="Contratos"
      description="Contratos, subscricoes, renovacoes e facturacao recorrente estao fora da V1 demonstravel. Esta area fica visivel apenas como backlog futuro."
      items={[
        'Sem contratos activos ou renovacoes reais nesta demo.',
        'Sem facturacao recorrente automatica.',
        'Sem botoes de renovacao ou criacao de contratos operacionais.',
      ]}
    />
  );
}
