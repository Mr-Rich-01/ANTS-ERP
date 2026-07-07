import { FutureModuleNotice } from '@/components/shell/FutureModuleNotice';

export default function RhPage() {
  return (
    <FutureModuleNotice
      title="Recursos Humanos e salarios"
      description="RH, contratos laborais e processamento salarial nao fazem parte da V1 demonstravel. A demo externa deve focar os fluxos comerciais, stock, tesouraria, contabilidade, POS e relatorios V1."
      items={[
        'Sem colaboradores ou folhas salariais reais nesta demo.',
        'Sem processamento de salarios.',
        'Sem apresentar este modulo como pronto para piloto.',
      ]}
    />
  );
}
