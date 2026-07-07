import { FutureModuleNotice } from '@/components/shell/FutureModuleNotice';

export default function ProducaoPage() {
  return (
    <FutureModuleNotice
      title="Producao"
      description="Este modulo nao faz parte da V1 demonstravel. As ordens de producao, fichas tecnicas e custeio industrial ficam reservados para uma fase propria."
      items={[
        'Sem ordens de producao reais nesta demo.',
        'Sem ficha tecnica ou consumo automatico de materias-primas.',
        'Sem prometer prazos de entrega deste modulo durante a demo externa.',
      ]}
    />
  );
}
