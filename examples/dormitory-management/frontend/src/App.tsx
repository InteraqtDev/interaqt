import { atom, RenderContext } from "axii";
import { styleSystem as s } from "axii-ui-theme-inc";
import { PageRoute } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { StudentPortal } from './pages/StudentPortal';
import { DormitoryManagement } from './pages/DormitoryManagement';
import { ApplicationManagement } from './pages/ApplicationManagement';
import { MemberManagement } from './pages/MemberManagement';
import { ScoreManagement } from './pages/ScoreManagement';
import { Reports } from './pages/Reports';

export function App({}, { createElement }: RenderContext) {
    const currentRoute = atom<PageRoute>('/dashboard');

    const handleNavigate = (route: PageRoute) => {
        currentRoute(route);
    };

    const renderCurrentPage = () => {
        switch (currentRoute()) {
            case '/dashboard':
                return <Dashboard onNavigate={handleNavigate} />;
            case '/student':
                return <StudentPortal />;
            case '/admin/dormitories':
                return <DormitoryManagement />;
            case '/applications':
                return <ApplicationManagement />;
            case '/members':
                return <MemberManagement />;
            case '/scores':
                return <ScoreManagement />;
            case '/admin/reports':
                return <Reports />;
            default:
                return <div style={{ color: s.colors.text.normal() }}>页面未找到</div>;
        }
    };

    return (
        <Layout 
            currentRoute={currentRoute()} 
            onNavigate={handleNavigate}
        >
            {renderCurrentPage}
        </Layout>
    );
}
