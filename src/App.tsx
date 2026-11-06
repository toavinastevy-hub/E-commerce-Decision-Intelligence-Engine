import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Sidebar, PageId } from './components/Sidebar';
import { DataPage } from './pages/DataPage';
import { ExecutivePage } from './pages/ExecutivePage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { DiscountsPage } from './pages/DiscountsPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { InventoryPage } from './pages/InventoryPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SalesRow, InventoryRow, InventoryAnalysisResult } from './types';
import { checkDataQuality, splitValidRows } from './engine/data_quality';
import { validateInventory, analyzeInventory } from './engine/inventory';
import { Menu, X } from 'lucide-react';

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('Data');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core Data State
  const [salesData, setSalesData] = useState<SalesRow[]>([]);
  const [excludedData, setExcludedData] = useState<any[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  // Inventory Data State
  const [inventoryData, setInventoryData] = useState<InventoryRow[] | null>(null);
  const [inventoryLabel, setInventoryLabel] = useState<string | null>(null);
  const [isSimulatedInventory, setIsSimulatedInventory] = useState<boolean>(false);

  // Compute inventory analysis result if both sales and inventory exist
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

  // One-click quick start
  const handleQuickStart = async () => {
    // 1. Fetch clean sales demo
    const sRes = await fetch('/data/sales.csv');
    const sText = await sRes.text();
    const sParsed = Papa.parse(sText, { header: true, skipEmptyLines: true });
    const sReport = checkDataQuality(sParsed.data, sParsed.meta.fields || []);
    const { valid, excluded } = splitValidRows(sParsed.data, sReport);

    // 2. Fetch inventory demo
    const iRes = await fetch('/data/inventory.csv');
    const iText = await iRes.text();
    const iParsed = Papa.parse(iText, { header: true, skipEmptyLines: true });
    const salesPids = Array.from(new Set(valid.map(r => r.product_id)));
    const { good } = validateInventory(iParsed.data, salesPids);

    // 3. Store in state
    setSalesData(valid);
    setExcludedData(excluded);
    setSourceLabel('SIMULATED demo data (clean)');
    setIsSimulated(true);

    setInventoryData(good);
    setInventoryLabel('SIMULATED demo inventory');
    setIsSimulatedInventory(true);

    // Navigate to executive summary
    setCurrentPage('Executive summary');
  };

  const handleConfirmData = (
    valid: SalesRow[],
    excluded: any[],
    label: string,
    simulated: boolean,
    embeddedInventory?: InventoryRow[]
  ) => {
    setSalesData(valid);
    setExcludedData(excluded);
    setSourceLabel(label);
    setIsSimulated(simulated);

    if (embeddedInventory && embeddedInventory.length > 0) {
      setInventoryData(embeddedInventory);
      setInventoryLabel(`${label} (Inventory sheet)`);
      setIsSimulatedInventory(simulated);
    } else if (isSimulatedInventory && !simulated) {
      // Clear demo inventory if real sales uploaded without inventory
      setInventoryData(null);
      setInventoryLabel(null);
      setIsSimulatedInventory(false);
    }
  };

  const handleSetInventory = (data: InventoryRow[], label: string, simulated: boolean) => {
    setInventoryData(data);
    setInventoryLabel(label);
    setIsSimulatedInventory(simulated);
  };

  // Close mobile drawer on page change
  const navigateTo = (page: PageId) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#F1F2FB] border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <span className="font-bold text-slate-900">EDIE</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar for Desktop & Mobile drawer */}
      <div className={`${mobileMenuOpen ? 'block' : 'hidden'} md:block shrink-0`}>
        <Sidebar
          currentPage={currentPage}
          onSelectPage={navigateTo}
          sourceLabel={sourceLabel}
          isSimulated={isSimulated}
          validRowCount={salesData.length}
          inventoryRowCount={inventoryData?.length || 0}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {currentPage === 'Data' && (
          <DataPage
            onQuickStart={handleQuickStart}
            onLoadCleanDemo={async () => {
              const res = await fetch('/data/sales.csv');
              const text = await res.text();
              const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
              const report = checkDataQuality(parsed.data, parsed.meta.fields || []);
              const { valid, excluded } = splitValidRows(parsed.data, report);
              handleConfirmData(valid, excluded, 'SIMULATED demo data (clean)', true);
            }}
            onLoadDirtyDemo={async () => {
              const res = await fetch('/data/sales_dirty.csv');
              const text = await res.text();
              const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
              const report = checkDataQuality(parsed.data, parsed.meta.fields || []);
              const { valid, excluded } = splitValidRows(parsed.data, report);
              handleConfirmData(valid, excluded, 'SIMULATED demo data with planted errors', true);
            }}
            onConfirmData={handleConfirmData}
            currentValidCount={salesData.length}
            currentExcludedCount={excludedData.length}
            sourceLabel={sourceLabel}
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

        {currentPage === 'Dashboard' && (
          <DashboardPage
            salesData={salesData}
            sourceLabel={sourceLabel}
            isSimulated={isSimulated}
            excludedCount={excludedData.length}
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
      </main>
    </div>
  );
}
export default App;
