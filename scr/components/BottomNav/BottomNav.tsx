import { LayoutDashboard, Scan } from 'lucide-react';

type Tab = 'dashboard' | 'scanner';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex justify-around items-center py-2">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`flex flex-col items-center justify-center w-20 py-2 rounded-xl transition-colors ${
            activeTab === 'dashboard'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-xs font-medium mt-1">Dashboard</span>
        </button>
        <button
          onClick={() => onTabChange('scanner')}
          className={`flex flex-col items-center justify-center w-20 py-2 rounded-xl transition-colors ${
            activeTab === 'scanner'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Scan className="w-6 h-6" />
          <span className="text-xs font-medium mt-1">Scanner</span>
        </button>
      </div>
    </nav>
  );
}
