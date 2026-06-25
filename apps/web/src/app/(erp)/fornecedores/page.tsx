import { EntityList } from '@/components/screens/EntityList';
import { SUPPLIER_COUNT, SUPPLIER_KPIS, SUPPLIERS } from '@/lib/data/entities';

export default function FornecedoresPage() {
  return (
    <EntityList
      kpis={SUPPLIER_KPIS}
      rows={SUPPLIERS}
      count={SUPPLIER_COUNT}
      countLabel="fornecedores"
      searchPlaceholder="Pesquisar fornecedor, NUIT…"
      newLabel="Novo fornecedor"
      newIcon="plus"
      profileType="supplier"
      entityHeader="Fornecedor"
    />
  );
}
