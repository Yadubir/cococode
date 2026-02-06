import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';

function Layout() {
    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <div className="flex-1 flex overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-hidden">
                    <Outlet />
                </main>
            </div>
            <StatusBar />
        </div>
    );
}

export default Layout;
