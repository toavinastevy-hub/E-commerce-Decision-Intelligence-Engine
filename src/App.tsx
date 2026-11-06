import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Sidebar, PageId } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { ExecutivePage } from './pages/ExecutivePage';
import { ProductsPage } from './pages/ProductsPage';
import { DiscountsPage } from './pages/DiscountsPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { InventoryPage } from './pages/InventoryPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { DataPage } from './pages/DataPage';
import { SalesRow, InventoryRow, InventoryAnalysisResult } from './types';
import { checkDataQuality, splitValidRows } from './engine/data_quality';
import { validateInventory, analyzeInventory } from './engine/inventory';
import { Menu, X, Sparkles, Sun, Moon } from 'lucide-react';

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('Dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Theme Management (Light by default, Dark mode ready)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('edie_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    localStorage.setItem('edie_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Core Data State
  const [salesData, setSalesData] = useState<SalesRow[]>([]);
  const [excludedData, setExcludedData] = useState<any[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  // Inventory Data State
  const [inventoryData, setInventoryData] = useState<InventoryRow[] | null>(null);
  const [inventoryLabel, setInventoryLabel] = useState<string | null>(null);
  const [isSimulatedInventory, setIsSimulatedInventory] = useState<boolean>(false);

  // Auto-load benchmark demo on mount so the user immediately sees the gorgeous executive dashboard
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const sRes = await fetch('/data/sales.csv');
        const sText = await sRes.text();
        const sParsed = Papa.parse(sText, { header: true, skipEmptyLines: true });
        const sReport = checkDataQuality(sParsed.data, sParsed.meta.fields || []);
        const { valid, excluded } = splitValidRows(sParsed.data, sReport);

        const iRes = await fetch('/data/inventory.csv');
        const iText = await iRes.text();
        const iParsed = Papa.parse(iText, { header: true, skipEmptyLines: true });
        const salesPids = Array.from(new Set(valid.map(r => r.product_id)));
        const { good } = validateInventory(iParsed.data, salesPids);

        if (isMounted) {
          setSalesData(valid);
          setExcludedData(excluded);
          setSourceLabel('Global Retail Enterprise Benchmark');
          setIsSimulated(true);

          setInventoryData(good);
          setInventoryLabel('Active Replenishment Inventory');
          setIsSimulatedInventory(true);
        }
      } catch (err) {
        console.error('Initial data load error:', err);
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  const inventoryResult: InventoryAnalysisResult | null = useMemo(() => {
    if (salesData.length === 0 || !inventoryData || inventoryData.length === 0) {
      return null;
    }
    try {
      return analyzeInventory(salesData, inventoryData);
    } catch {
      return null;
    }
  }, [salesData, inventoryData]);

  // Handlers for Data Page confirmations
  const handleConfirmData = (
    data: SalesRow[],
    excluded: any[],
    label: string,
    simulated: boolean
  ) => {
    setSalesData(data);
    setExcludedData(excluded);
    setSourceLabel(label);
    setIsSimulated(simulated);
  };

  const handleSetInventory = (
    data: InventoryRow[] | null,
    label: string | null,
    simulated: boolean
  ) => {
    setInventoryData(data);
    setInventoryLabel(label);
    setIsSimulatedInventory(simulated);
  };

  const navigateTo = (page: PageId) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-[#0B0F19] text-slate-800 dark:text-slate-100 antialiased transition-colors duration-200">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-[#0d121f] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <Sparkles className="w-4 h-4 text-indigo-100" />
          </div>
          <div>
            <span className="font-bold text-sm text-slate-900 dark:text-white block leading-none">EDIE Analytics</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Decision Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar Navigation - Fixed & Sticky on desktop */}
      <div className={`${mobileMenuOpen ? 'fixed inset-0 z-50 bg-black/50 md:relative md:bg-transparent' : 'hidden md:block'} md:sticky md:top-0 md:h-screen shrink-0`}>
        <div
          className={`${mobileMenuOpen ? 'w-72 h-full' : 'w-full h-full'}`}
          onClick={e => e.stopPropagation()}
        >
          <Sidebar
            currentPage={currentPage}
            onSelectPage={navigateTo}
            sourceLabel={sourceLabel}
            isSimulated={isSimulated}
            validRowCount={salesData.length}
            inventoryRowCount={inventoryData?.length || 0}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </div>
      </div>

      {/* Main Analytical Canvas */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
        {currentPage === 'Dashboard' && (
          <DashboardPage
            salesData={salesData}
            sourceLabel={sourceLabel}
            onNavigateToData={() => navigateTo('Data')}
            onNavigateToExecutive={() => navigateTo('Executive summary')}
          />
        )}

        {currentPage === 'Executive summary' && (
          <ExecutivePage
            salesData={salesData}
            inventoryResult={inventoryResult}
            sourceLabel={sourceLabel}
            isSimulated={isSimulated}
            simulatedInventory={isSimulatedInventory}
            onNavigateToRecommendations={() => navigateTo('Recommendations')}
            onNavigateToDashboard={() => navigateTo('Dashboard')}
          />
        )}

        {currentPage === 'Products' && (
          <ProductsPage salesData={salesData} />
        )}

        {currentPage === 'Discounts' && (
          <DiscountsPage salesData={salesData} />
        )}

        {currentPage === 'Simulator' && (
          <SimulatorPage salesData={salesData} />
        )}

        {currentPage === 'Inventory' && (
          <InventoryPage
            salesData={salesData}
            inventoryData={inventoryData}
            inventoryLabel={inventoryLabel}
            isSimulatedInventory={isSimulatedInventory}
            onSetInventory={handleSetInventory}
          />
        )}

        {currentPage === 'Recommendations' && (
          <RecommendationsPage
            salesData={salesData}
            inventoryResult={inventoryResult}
            isSimulated={isSimulated}
            simulatedInventory={isSimulatedInventory}
            excludedCount={excludedData.length}
          />
        )}

        {currentPage === 'Data' && (
          <DataPage
            onConfirmData={handleConfirmData}
            onNavigateToDashboard={() => navigateTo('Dashboard')}
          />
        )}
      </main>
    </div>
  );
}
export default App;
