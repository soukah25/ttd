import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Plus, FileText, Bell, ScrollText, LogOut, Menu,
  ChevronLeft, Home, Truck, CheckSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigationHelpers } from '../hooks/useNavigationHelpers';
import { NotificationBell } from './NotificationBell';
import { supabase } from '../lib/supabase';

interface ClientLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function ClientLayout({ children, title, subtitle }: ClientLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { handleClientLogout } = useNavigationHelpers();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [clientName, setClientName] = useState('Espace Client');
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (user) {
      loadClientName();
      fetchNotificationCount();
    }
  }, [user]);

  const loadClientName = async () => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('first_name, last_name')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (data?.first_name) {
        setClientName(`${data.first_name} ${data.last_name || ''}`.trim());
      }
    } catch (error) {
      console.error('Error loading client name:', error);
    }
  };

  const fetchNotificationCount = async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user?.id)
        .eq('read', false);
      setNotificationCount(data?.length || 0);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home, color: 'text-blue-600', route: '/client/dashboard' },
    { id: 'new-request', label: 'Nouvelle demande', icon: Plus, color: 'text-cyan-600', route: '/client/quote' },
    { id: 'my-quotes', label: 'Mes devis', icon: FileText, color: 'text-indigo-600', route: '/client/quotes' },
    { id: 'checklist', label: 'Ma Checklist', icon: CheckSquare, color: 'text-green-600', route: '/client/checklist' },
    { id: 'contracts', label: 'Mes contrats', icon: ScrollText, color: 'text-orange-600', route: '/client/contracts' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-red-600', route: '/client/notifications', badge: notificationCount > 0 ? notificationCount : undefined },
  ];

  const getActiveId = (): string => {
    const path = location.pathname;
    if (path.includes('/client/quote') && !path.includes('/client/quotes')) return 'new-request';
    if (path.includes('/client/quotes')) return 'my-quotes';
    if (path.includes('/client/checklist')) return 'checklist';
    if (path.includes('/client/notifications')) return 'notifications';
    if (path.includes('/client/contracts')) return 'contracts';
    if (path.includes('/client/payment')) return 'my-quotes';
    if (path.includes('/client/photos')) return 'my-quotes';
    return 'dashboard';
  };

  const currentActiveId = getActiveId();
  const currentTitle = title || menuItems.find(m => m.id === currentActiveId)?.label || 'Tableau de bord';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white shadow-lg transition-all duration-300 fixed left-0 top-0 h-full z-20 flex flex-col`}>
        {/* Top: Toggle + Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title={sidebarOpen ? 'Réduire' : 'Agrandir'}
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <h1 className="font-bold text-gray-900 truncate">{clientName}</h1>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.route)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition ${
                currentActiveId === item.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
              }`}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${item.color}`} />
              {sidebarOpen && (
                <span className="text-sm text-gray-700 flex-1">{item.label}</span>
              )}
              {sidebarOpen && item.badge && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-gray-100 p-4">
          <button
            onClick={handleClientLogout}
            className="w-full flex items-center gap-3 px-2 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-20'} transition-all duration-300`}>
        {/* Top Bar */}
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{currentTitle}</h2>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-4">
              <NotificationBell
                onNotificationClick={async (notification) => {
                  if ((notification.type === 'quote_update' || notification.type === 'new_quote') && notification.related_id) {
                    navigate('/client/quotes');
                  }
                }}
              />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
