import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { ScreenHeader } from '@/components/shell/ScreenHeader';

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ants-shell"
      style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}
    >
      <Sidebar />
      <main
        className="ants-main"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Topbar />
        <div className="ants-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <ScreenHeader />
          {children}
        </div>
      </main>
    </div>
  );
}
