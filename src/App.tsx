import { useState } from 'react';
import { Dashboard } from './components/Dashboard/Dashboard';
import { Scanner } from './components/Scanner/Scanner';
import { BottomNav } from './components/BottomNav/BottomNav';

type Tab = 'dashboard' | 'scanner';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'scanner' && <Scanner />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
