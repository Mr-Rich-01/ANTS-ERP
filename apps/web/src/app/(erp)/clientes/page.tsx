import { EntityList } from '@/components/screens/EntityList';
import { CLIENT_COUNT, CLIENT_KPIS, CLIENTS } from '@/lib/data/entities';

export default function ClientesPage() {
  return (
    <EntityList
      kpis={CLIENT_KPIS}
      rows={CLIENTS}
      count={CLIENT_COUNT}
      countLabel="clientes"
      searchPlaceholder="Pesquisar cliente, NUIT…"
      newLabel="Novo cliente"
      newIcon="user-plus"
      profileType="client"
      entityHeader="Cliente"
    />
  );
}
