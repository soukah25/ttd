import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut, Package, FileText, Euro, Truck, Camera,
  Home, Bell, Building, Image, Menu, ChevronLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { showToast } from '../utils/toast';

interface MoverLayoutProps {
  children: React.ReactNode;
  activeSection?: string;
  title?: string;
}

export function MoverLayout({ children, activeSection: propActiveSection, title }: MoverLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [companyName, setCompanyName] = useState('Espace Pro');

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: Home, color: 'text-emerald-600', route: '/mover/dashboard' },
    { id: 'quote-requests', label: 'Demandes de devis', icon: Package, color: 'text-blue-600', route: '/mover/quote-requests' },
    { id: 'my-quotes', label: 'Mes devis', icon: FileText, color: 'text-indigo-600', route: '/mover/my-quotes' },
    { id: 'earnings', label: 'Gains totaux', icon: Euro, color: 'text-green-600', route: '/mover/finances' },
    { id: 'documents', label: 'Mes Documents', icon: FileText, color: 'text-orange-600', route: '/mover/documents' },
    { id: 'portfolio', label: 'Portfolio', icon: Image, color: 'text-purple-600', route: '/mover/portfolio' },
    { id: 'company-info', label: 'Informations entreprise', icon: Building, color: 'text-gray-600', route: '/mover/company-info' },
    { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-red-600', route: '/mover/notifications' },
    { id: 'damage-photos', label: 'Photos et dommages', icon: Camera, color: 'text-amber-600', route: '/mover/damage-photos' },
  ];

  // Determine which menu item is active based on current route
  const getActiveId = (): string => {
    if (propActiveSection) return propActiveSection;
    const path = location.pathname;
    if (path.includes('/quote-requests')) return 'quote-requests';
    if (path.includes('/my-quotes')) return 'my-quotes';
    if (path.includes('/finances')) return 'earnings';
    if (path.includes('/damage-photos')) return 'damage-photos';
    if (path.includes('/documents')) return 'documents';
    if (path.includes('/portfolio')) return 'portfolio';
    if (path.includes('/company-info')) return 'company-info';
    if (path.includes('/mover/notifications')) return 'notifications';
    return 'dashboard';
  };

  useEffect(() => {
    if (user) {
      loadCompanyName();
    }
  }, [user]);

  const loadCompanyName = async () => {
    try {
      const { data } = await supabase
        .from('movers')
        .select('company_name')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (data?.company_name) {
        setCompanyName(data.company_name);
      }
    } catch (error) {
      console.error('Error loading company name:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      showToast('Déconnexion réussie', 'success');
      navigate('/');
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      showToast('Erreur lors de la déconnexion', 'error');
    }
  };

  const handleMenuClick = (item: typeof menuItems[0]) => {
    navigate(item.route);
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
            {/* Collapse button BEFORE icon */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title={sidebarOpen ? 'Réduire' : 'Agrandir'}
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div className="overflow-hidden">
                <h1 className="font-bold text-gray-900 truncate">{companyName}</h1>
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
              onClick={() => handleMenuClick(item)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition ${
                currentActiveId === item.id ? 'bg-emerald-50 border-r-4 border-emerald-500' : ''
              }`}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${item.color}`} />
              {sidebarOpen && (
                <span className="text-sm text-gray-700">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-gray-100 p-4">
          <button
            onClick={handleLogout}
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
            <h2 className="text-xl font-bold text-gray-900">{currentTitle}</h2>
            <div className="flex items-center gap-4">
              <NotificationBell
                onNotificationClick={(notification) => {
                  if ((notification.type === 'quote_update' || notification.type === 'new_quote_request') && notification.related_id) {
                    navigate('/mover/my-quotes');
                  } else if (notification.type === 'new_quote_request') {
                    navigate('/mover/quote-requests');
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
