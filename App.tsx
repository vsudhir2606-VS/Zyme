import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, ShieldAlert, Globe, Settings, CheckCircle2, Download, FileText, Loader2, RefreshCw, X, ChevronDown, ChevronRight, Zap, Layers, Activity, Table } from 'lucide-react';
import { TagInput } from './components/TagInput.tsx';
import { Processor } from './components/Processor.tsx';
import { Consolidator } from './components/Consolidator.tsx';
import { DataSheet } from './components/DataSheet.tsx';
import { getReferenceData, saveReferenceData, clearReferenceData } from './utils/db.ts';

import { InventoryReport } from './components/InventoryReport.tsx';

// Default values
const DEFAULT_APRV_CODES = ['RU', 'UA', 'NI', 'VE', 'BY', 'CU', 'IR', 'KP', 'SY'];
const DEFAULT_RISK_KEYWORDS = [
  'SANCTION', 'EMBARGO', 'DENIED',
  'Lockheed', 'Raytheon', 'Northrop', 'Bae', 'RTX', 'United Technologies', 'UTC', 'Rockwell',
  'Kharon', 'Alliant', 'AeroVironment', 'ViaSat', 'Data Link Solution', 'Projectina AG',
  'General Dynamic', 'LUKOIL', 'Citgo', 'Huawei', 'Nayara', 'Wintershall', 'Huntington', 'HII'
];

type AppTab = 'processor' | 'consolidator' | 'inventory' | 'datasheet';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('processor');
  const [referenceData, setReferenceData] = useState<Record<string, string[]> | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(true);

  useEffect(() => {
    async function loadSavedData() {
      try {
        const saved = await getReferenceData();
        if (saved && saved.data) {
          setReferenceData(saved.data);
          setReferenceFileName(saved.fileName);
        }
      } catch (err) {
        console.error("Failed to load saved reference data from IndexedDB:", err);
      } finally {
        setIsDbLoading(false);
      }
    }
    loadSavedData();
  }, []);
  
  // UI State for collapsibles
  const [isRiskExpanded, setIsRiskExpanded] = useState(false);
  const [isCodesExpanded, setIsCodesExpanded] = useState(false);

  // Configuration State with Persistence
  const [highRiskKeywords, setHighRiskKeywords] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zyme_highRiskKeywords');
      return saved ? JSON.parse(saved) : DEFAULT_RISK_KEYWORDS;
    } catch (e) {
      console.error('Failed to load high risk keywords', e);
      return [];
    }
  });

  const [aprvCodes, setAprvCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('zyme_aprvCodes');
      return saved ? JSON.parse(saved) : DEFAULT_APRV_CODES;
    } catch (e) {
      console.error('Failed to load APRV codes', e);
      return DEFAULT_APRV_CODES;
    }
  });

  // Persist state
  useEffect(() => {
    localStorage.setItem('zyme_highRiskKeywords', JSON.stringify(highRiskKeywords));
  }, [highRiskKeywords]);

  useEffect(() => {
    localStorage.setItem('zyme_aprvCodes', JSON.stringify(aprvCodes));
  }, [aprvCodes]);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-inter selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* 
        ========================================
        SIDEBAR
        ========================================
      */}
      <aside className="w-80 bg-[#0B0F19] flex-shrink-0 flex flex-col border-r border-slate-800/60 shadow-2xl z-20">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-800/60 bg-[#0B0F19]">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-indigo-500 blur opacity-40 group-hover:opacity-60 transition-opacity rounded-lg"></div>
              <div className="relative p-2.5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-slate-700 shadow-xl">
                <Zap className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-1">Zyme<span className="text-indigo-500">Processor</span></h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Compliance Engine</p>
            </div>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          
          {/* Navigation Section */}
          <div className="space-y-1 mb-6">
            <p className="px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Tools</p>
            <button 
              onClick={() => setActiveTab('processor')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'processor' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <Activity size={18} />
              <span className="text-sm font-semibold">Data Processor</span>
            </button>
            <button 
              onClick={() => setActiveTab('consolidator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'consolidator' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <Layers size={18} />
              <span className="text-sm font-semibold">Zyme Consolidator</span>
            </button>
            <button 
              onClick={() => setActiveTab('inventory')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'inventory' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <FileText size={18} />
              <span className="text-sm font-semibold">Inventory Report</span>
            </button>
            <button 
              onClick={() => setActiveTab('datasheet')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'datasheet' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <Table size={18} />
              <span className="text-sm font-semibold">Data Sheet</span>
            </button>
          </div>

          <p className="px-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Configuration</p>

          {/* Collapsible Section: Risk */}
          <div className={`
            border transition-all duration-300 rounded-xl overflow-hidden
            ${isRiskExpanded ? 'bg-slate-900/40 border-slate-700' : 'bg-transparent border-slate-800/50 hover:bg-slate-900/20'}
          `}>
            <button 
              onClick={() => setIsRiskExpanded(!isRiskExpanded)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <ShieldAlert size={16} />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-semibold text-slate-200">Risk Keywords</h2>
                </div>
              </div>
              {isRiskExpanded ? <ChevronDown size={16} className="text-slate-500"/> : <ChevronRight size={16} className="text-slate-500"/>}
            </button>
            
            {/* Expanded Content */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isRiskExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="p-4 pt-0">
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Matches in "Customer Name" trigger <span className="text-amber-500">High Risk</span>.
                </p>
                <TagInput 
                  tags={highRiskKeywords} 
                  onChange={setHighRiskKeywords} 
                  placeholder="Add keyword..." 
                />
              </div>
            </div>

            {/* Collapsed Preview (Comma separated) */}
            {!isRiskExpanded && highRiskKeywords.length > 0 && (
              <div className="px-4 pb-4 -mt-1 cursor-pointer" onClick={() => setIsRiskExpanded(true)}>
                <p className="text-xs text-slate-500 truncate font-mono">
                  {highRiskKeywords.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Collapsible Section: Country Codes */}
          <div className={`
            border transition-all duration-300 rounded-xl overflow-hidden
            ${isCodesExpanded ? 'bg-slate-900/40 border-slate-700' : 'bg-transparent border-slate-800/50 hover:bg-slate-900/20'}
          `}>
            <button 
              onClick={() => setIsCodesExpanded(!isCodesExpanded)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Globe size={16} />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-semibold text-slate-200">APRV Codes</h2>
                </div>
              </div>
              {isCodesExpanded ? <ChevronDown size={16} className="text-slate-500"/> : <ChevronRight size={16} className="text-slate-500"/>}
            </button>
            
            {/* Expanded Content */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isCodesExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="p-4 pt-0">
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  CTR matches flag as <span className="text-emerald-500">APRV</span>.
                </p>
                <TagInput 
                  tags={aprvCodes} 
                  onChange={setAprvCodes} 
                  placeholder="Add code..." 
                />
              </div>
            </div>

            {/* Collapsed Preview (Comma separated) */}
            {!isCodesExpanded && aprvCodes.length > 0 && (
              <div className="px-4 pb-4 -mt-1 cursor-pointer" onClick={() => setIsCodesExpanded(true)}>
                <p className="text-xs text-slate-500 truncate font-mono">
                  {aprvCodes.join(', ')}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/60 bg-[#0B0F19]">
           <div className="flex items-center justify-between text-[10px] text-slate-600">
              <span>Secure Environment</span>
              <span>v2.2.0</span>
           </div>
        </div>
      </aside>

      {/* 
        ========================================
        MAIN WORKSPACE
        ========================================
      */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-100">
        
        {/* Modern Ambient Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-20 w-[600px] h-[600px] bg-indigo-300/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-blob"></div>
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-300/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-32 left-1/3 w-[600px] h-[600px] bg-pink-300/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 animate-blob animation-delay-4000"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
        </div>

        {/* Header */}
        <header className="relative z-10 px-8 py-6 flex justify-between items-center bg-white/40 backdrop-blur-md border-b border-white/20">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {activeTab === 'processor' 
                ? 'Data Processing' 
                : activeTab === 'consolidator' 
                ? 'Data Consolidation' 
                : activeTab === 'inventory' 
                ? 'Inventory Reporting' 
                : 'Data Sheet'}
            </h2>
            <p className="text-slate-500 text-sm font-medium">
              {activeTab === 'processor' 
                ? 'Manage and transform your compliance datasets' 
                : activeTab === 'consolidator'
                ? 'Merge multiple reports into a master dataset'
                : activeTab === 'inventory'
                ? 'Generate daily inventory status comments from Excel files'
                : 'Upload global customer mappings to enrich your compliance sheet Column V'}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur border border-white/40 rounded-full shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-semibold text-slate-600">System Operational</span>
             </div>
             <button className="p-2.5 bg-white rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 hover:shadow-lg transition-all border border-slate-200/60">
               <Settings className="w-5 h-5" />
             </button>
          </div>
        </header>

        {/* Center Content */}
        {activeTab === 'processor' ? (
          <Processor 
            highRiskKeywords={highRiskKeywords} 
            aprvCodes={aprvCodes} 
            referenceData={referenceData}
            referenceFileName={referenceFileName}
          />
        ) : activeTab === 'consolidator' ? (
          <Consolidator />
        ) : activeTab === 'inventory' ? (
          <InventoryReport />
        ) : (
          <DataSheet 
            onDataLoaded={async (data, name) => {
              setReferenceData(data);
              setReferenceFileName(name);
              if (data && name) {
                try {
                  await saveReferenceData(data, name);
                } catch (err) {
                  console.error("Failed to save background reference data in IndexedDB:", err);
                }
              } else {
                try {
                  await clearReferenceData();
                } catch (err) {
                  console.error("Failed to clear background reference data from IndexedDB:", err);
                }
              }
            }}
            referenceData={referenceData}
            referenceFileName={referenceFileName}
          />
        )}
      </main>
    </div>
  );
}
