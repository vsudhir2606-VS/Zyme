import React, { useState, useEffect, useMemo } from 'react';
import { Upload, FileSpreadsheet, ShieldAlert, Globe, Settings, CheckCircle2, Download, FileText, Loader2, RefreshCw, X, ChevronDown, ChevronRight, Zap, Layers, Activity, Table, FolderArchive, Sparkles, SlidersHorizontal, Lock, Unlock, KeyRound, Check, Trash2, Search, BookmarkPlus } from 'lucide-react';
import { TagInput } from './components/TagInput.tsx';
import { Processor } from './components/Processor.tsx';
import { LiveProcessing } from './components/LiveProcessing.tsx';
import { Consolidator } from './components/Consolidator.tsx';
import { OofConsolidator } from './components/OofConsolidator.tsx';
import { DataSheet } from './components/DataSheet.tsx';
import { getReferenceData, saveReferenceData, clearReferenceData } from './utils/db.ts';
import { 
  getSavedSplCcComments, 
  deleteSavedSplCcComment, 
  clearAllSavedSplCcComments, 
  exportSplCcCommentsToExcel, 
  SavedSplCcComment 
} from './utils/splCcStorage.ts';

import { InventoryReport } from './components/InventoryReport.tsx';

// Default values
const DEFAULT_APRV_CODES = ['RU', 'UA', 'NI', 'VE', 'BY', 'CU', 'IR', 'KP', 'SY'];
const DEFAULT_RISK_KEYWORDS = [
  'SANCTION', 'EMBARGO', 'DENIED',
  'Lockheed', 'Raytheon', 'Northrop', 'Bae', 'RTX', 'United Technologies', 'UTC', 'Rockwell',
  'Kharon', 'Alliant', 'AeroVironment', 'ViaSat', 'Data Link Solution', 'Projectina AG',
  'General Dynamic', 'LUKOIL', 'Citgo', 'Huawei', 'Nayara', 'Wintershall', 'Huntington', 'HII'
];

type AppTab = 'processor' | 'live_processing' | 'consolidator' | 'oof_consolidator' | 'inventory' | 'datasheet';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('processor');
  const [referenceData, setReferenceData] = useState<Record<string, string[]> | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // Cross-tool handoff to Live Processing
  const [liveProcessingRows, setLiveProcessingRows] = useState<any[][] | null>(null);
  const [liveProcessingFileName, setLiveProcessingFileName] = useState<string | null>(null);

  // Live Processing Lock & Password State (Locked by default, default password '1234')
  const [isLiveLockEnabled, setIsLiveLockEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zyme_liveLockEnabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [livePassword, setLivePassword] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('zyme_livePassword');
      return saved || '1234';
    } catch {
      return '1234';
    }
  });

  const [isLiveUnlocked, setIsLiveUnlocked] = useState<boolean>(false);

  // Unlock Modal State (when clicking Open in Live Processing or Live Processing tab while locked)
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);
  const [unlockInput, setUnlockInput] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [pendingLiveHandoff, setPendingLiveHandoff] = useState<{ rows: any[][] | null; fileName: string | null } | null>(null);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTogglePassword, setSettingsTogglePassword] = useState<string>('');
  const [settingsToggleError, setSettingsToggleError] = useState<string | null>(null);
  const [settingsToggleSuccess, setSettingsToggleSuccess] = useState<string | null>(null);

  // Change Password Form State inside Settings
  const [currentPwdInput, setCurrentPwdInput] = useState<string>('');
  const [newPwdInput, setNewPwdInput] = useState<string>('');
  const [confirmPwdInput, setConfirmPwdInput] = useState<string>('');
  const [pwdChangeError, setPwdChangeError] = useState<string | null>(null);
  const [pwdChangeSuccess, setPwdChangeSuccess] = useState<string | null>(null);

  // Saved SPL CC Comments State for Settings Modal
  const [savedSplCcList, setSavedSplCcList] = useState<SavedSplCcComment[]>(() => {
    try {
      return getSavedSplCcComments();
    } catch {
      return [];
    }
  });
  const [splCcSearch, setSplCcSearch] = useState<string>('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'splcc' | 'security'>('splcc');

  // Sync saved SPL CC list whenever updated
  useEffect(() => {
    const handleSplCcUpdate = () => {
      try {
        setSavedSplCcList(getSavedSplCcComments());
      } catch {
        // no-op
      }
    };
    window.addEventListener('zyme:splcc-updated', handleSplCcUpdate);
    window.addEventListener('storage', handleSplCcUpdate);
    return () => {
      window.removeEventListener('zyme:splcc-updated', handleSplCcUpdate);
      window.removeEventListener('storage', handleSplCcUpdate);
    };
  }, []);

  // Also refresh whenever Settings opens
  useEffect(() => {
    if (isSettingsOpen) {
      try {
        setSavedSplCcList(getSavedSplCcComments());
        setExportNotice(null);
      } catch {
        // no-op
      }
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    localStorage.setItem('zyme_liveLockEnabled', JSON.stringify(isLiveLockEnabled));
  }, [isLiveLockEnabled]);

  useEffect(() => {
    localStorage.setItem('zyme_livePassword', livePassword);
  }, [livePassword]);

  const isCurrentlyLocked = isLiveLockEnabled && !isLiveUnlocked;

  const handleRequestOpenLiveProcessing = (rows?: any[][] | null, fileName?: string | null) => {
    if (isCurrentlyLocked) {
      setPendingLiveHandoff({ rows: rows ?? null, fileName: fileName ?? null });
      setUnlockInput('');
      setUnlockError(null);
      setIsUnlockModalOpen(true);
    } else {
      if (rows !== undefined) setLiveProcessingRows(rows);
      if (fileName !== undefined) setLiveProcessingFileName(fileName);
      setActiveTab('live_processing');
    }
  };

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockInput === livePassword) {
      setIsLiveUnlocked(true);
      setIsUnlockModalOpen(false);
      setUnlockInput('');
      setUnlockError(null);
      if (pendingLiveHandoff) {
        if (pendingLiveHandoff.rows) setLiveProcessingRows(pendingLiveHandoff.rows);
        if (pendingLiveHandoff.fileName) setLiveProcessingFileName(pendingLiveHandoff.fileName);
        setPendingLiveHandoff(null);
      }
      setActiveTab('live_processing');
    } else {
      setUnlockError('Incorrect password. Please try again.');
    }
  };

  const handleToggleLockSetting = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsToggleError(null);
    setSettingsToggleSuccess(null);

    if (settingsTogglePassword !== livePassword) {
      setSettingsToggleError('Enter the valid current password to change lock state.');
      return;
    }

    const nextEnabled = !isLiveLockEnabled;
    setIsLiveLockEnabled(nextEnabled);
    if (nextEnabled) {
      setIsLiveUnlocked(false);
      if (activeTab === 'live_processing') {
        setActiveTab('processor');
      }
      setSettingsToggleSuccess('Password lock enabled for Live Processing.');
    } else {
      setIsLiveUnlocked(true);
      setSettingsToggleSuccess('Password lock disabled. Live Processing is now unlocked.');
    }
    setSettingsTogglePassword('');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdChangeError(null);
    setPwdChangeSuccess(null);

    if (currentPwdInput !== livePassword) {
      setPwdChangeError('Current password is incorrect.');
      return;
    }
    if (!newPwdInput.trim()) {
      setPwdChangeError('New password cannot be empty.');
      return;
    }
    if (newPwdInput !== confirmPwdInput) {
      setPwdChangeError('New password and confirmation do not match.');
      return;
    }

    setLivePassword(newPwdInput.trim());
    setCurrentPwdInput('');
    setNewPwdInput('');
    setConfirmPwdInput('');
    setPwdChangeSuccess('Password updated successfully.');
  };

  useEffect(() => {
    async function loadSavedData() {
      try {
        const saved = await getReferenceData();
        if (saved && saved.data) {
          setReferenceData(saved.data);
          setReferenceFileName(saved.fileName);
          setIsDbLoading(false);
          return;
        }

        // Fallback to pre-packaged/pre-saved data sheet from codebase server
        const response = await fetch('/api/get-datasheet');
        if (response.ok) {
          const preloaded = await response.json();
          if (preloaded && preloaded.referenceData) {
            setReferenceData(preloaded.referenceData);
            setReferenceFileName(preloaded.referenceFileName);
            
            // Sync it to Local IndexedDB so it remains available
            await saveReferenceData(preloaded.referenceData, preloaded.referenceFileName);
          }
        }
      } catch (err) {
        console.error("Failed to load saved reference data from IndexedDB or API:", err);
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
              <Sparkles size={18} className="text-indigo-400" />
              <span className="text-sm font-semibold">Zyme E4H new</span>
              <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                NEW
              </span>
            </button>
            <button 
              onClick={() => handleRequestOpenLiveProcessing()}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'live_processing' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <SlidersHorizontal size={18} className="text-indigo-400" />
              <span className="text-sm font-semibold">Live Processing</span>
              <div className="ml-auto flex items-center gap-1.5">
                {isCurrentlyLocked && (
                  <Lock size={13} className="text-amber-400" />
                )}
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  BETA
                </span>
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('consolidator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'consolidator' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <Layers size={18} />
              <span className="text-sm font-semibold">Zyme Consolidator</span>
            </button>
            <button 
              onClick={() => setActiveTab('oof_consolidator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'oof_consolidator' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'}`}
            >
              <FolderArchive size={18} />
              <span className="text-sm font-semibold">Off Consolidator</span>
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
        <header className="relative z-10 px-8 py-6 flex justify-between items-center bg-white/40 backdrop-blur-md border-b border-white/20 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                {activeTab === 'processor' 
                  ? 'Zyme E4H New' 
                  : activeTab === 'live_processing'
                  ? 'Live Processing'
                  : activeTab === 'consolidator' 
                  ? 'Data Consolidation' 
                  : activeTab === 'oof_consolidator'
                  ? 'Off Consolidation'
                  : activeTab === 'inventory' 
                  ? 'Inventory Reporting' 
                  : 'Data Sheet'}
              </h2>
              {activeTab === 'live_processing' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-2xs">
                  Beta
                </span>
              )}
            </div>
            {activeTab !== 'live_processing' && (
              <p className="text-slate-500 text-sm font-medium">
                {activeTab === 'processor' 
                  ? 'Enterprise compliance data processing and deduplication' 
                  : activeTab === 'consolidator'
                  ? 'Merge multiple reports into a master dataset'
                  : activeTab === 'oof_consolidator'
                  ? 'Consolidate reports and attach source file name in Column A for all rows'
                  : activeTab === 'inventory'
                  ? 'Generate daily inventory status comments from Excel files'
                  : 'Upload global customer mappings to enrich your compliance sheet Column V'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur border border-white/40 rounded-full shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-semibold text-slate-600">System Operational</span>
             </div>
             <button
               onClick={() => {
                 setIsSettingsOpen(true);
                 setSettingsToggleError(null);
                 setSettingsToggleSuccess(null);
                 setPwdChangeError(null);
                 setPwdChangeSuccess(null);
               }}
               title="Settings & Password Lock"
               className="p-2.5 bg-white rounded-full text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:shadow-lg transition-all border border-slate-200/60"
             >
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
            isLiveLocked={isCurrentlyLocked}
            onOpenLiveProcessing={(rows, name) => {
              handleRequestOpenLiveProcessing(rows, name);
            }}
          />
        ) : activeTab === 'live_processing' ? (
          <LiveProcessing 
            initialProcessedRows={liveProcessingRows}
            initialFileName={liveProcessingFileName}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : activeTab === 'consolidator' ? (
          <Consolidator />
        ) : activeTab === 'oof_consolidator' ? (
          <OofConsolidator />
        ) : activeTab === 'inventory' ? (
          <InventoryReport />
        ) : (
          <DataSheet 
            onDataLoaded={async (data, name) => {
              setReferenceData(data);
              setReferenceFileName(name);
              if (data && name) {
                try {
                  // Save to IndexedDB (local browser cache)
                  await saveReferenceData(data, name);

                  // Commit to server-side filesystem (perm-preset)
                  await fetch('/api/save-datasheet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ referenceData: data, referenceFileName: name })
                  });
                } catch (err) {
                  console.error("Failed to save background reference data in IndexedDB/API:", err);
                }
              } else {
                try {
                  // Clear IndexedDB
                  await clearReferenceData();

                  // Clear server-side preset
                  await fetch('/api/save-datasheet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ referenceData: null, referenceFileName: null })
                  });
                } catch (err) {
                  console.error("Failed to clear background reference data from IndexedDB/API:", err);
                }
              }
            }}
            referenceData={referenceData}
            referenceFileName={referenceFileName}
          />
        )}

        {/* UNLOCK LIVE PROCESSING MODAL */}
        {isUnlockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
                    <Lock size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Live Processing Locked
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enter password to unlock Live Processing
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsUnlockModalOpen(false);
                    setPendingLiveHandoff(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUnlockSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    autoFocus
                    value={unlockInput}
                    onChange={(e) => {
                      setUnlockInput(e.target.value);
                      setUnlockError(null);
                    }}
                    placeholder="Enter password..."
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                  />
                  {unlockError && (
                    <p className="text-xs text-red-600 font-medium mt-1.5">
                      {unlockError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnlockModalOpen(false);
                      setPendingLiveHandoff(null);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                  >
                    <Unlock size={13} />
                    <span>Unlock</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SETTINGS MODAL (Password Enable Option & Change Password Option) */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-2xl w-full flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              
              {/* ELITE HEADER */}
              <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 flex-shrink-0">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Settings & Controls
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      SPL CC comments repository, Excel export & access lock
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  title="Close settings"
                >
                  <X size={17} />
                </button>
              </div>

              {/* SEGMENTED TAB SWITCHER */}
              <div className="px-6 pt-2 bg-slate-50/70 border-b border-slate-200/80 flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSettingsActiveTab('splcc')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'splcc'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs rounded-t-xl -mb-px'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileSpreadsheet size={15} className={settingsActiveTab === 'splcc' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>SPL CC Comments Archive</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                    settingsActiveTab === 'splcc'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-200/80 text-slate-600'
                  }`}>
                    {savedSplCcList.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsActiveTab('security')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
                    settingsActiveTab === 'security'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs rounded-t-xl -mb-px'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Lock size={15} className={settingsActiveTab === 'security' ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>Access & Security</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isLiveLockEnabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isLiveLockEnabled ? (isLiveUnlocked ? 'Unlocked' : 'Locked') : 'Disabled'}
                  </span>
                </button>
              </div>

              {/* MODAL BODY */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 bg-slate-50/40">

                {/* TAB 1: SPL CC COMMENTS ARCHIVE & EXCEL EXPORT */}
                {settingsActiveTab === 'splcc' && (
                  <div className="space-y-4">
                    
                    {/* Top Stat Overview Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Total Archived
                        </span>
                        <div className="text-xl font-black text-slate-900 mt-1 tabular-nums flex items-baseline gap-1.5">
                          <span>{savedSplCcList.length}</span>
                          <span className="text-xs font-semibold text-slate-500">records</span>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Export Format
                        </span>
                        <div className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                          <FileSpreadsheet size={15} className="text-emerald-600" />
                          <span>Microsoft Excel (.xlsx)</span>
                        </div>
                      </div>

                      <div className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Included Fields
                        </span>
                        <div className="text-[11px] font-medium text-slate-600 mt-1 line-clamp-1" title="Customer Name, Address, Country, RPL Names, Comments">
                          Name, Address, Country, RPL & Notes
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          Excel Spreadsheet Export
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Includes Customer Name, Address & Country with RPL Names & Comments
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {savedSplCcList.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Are you sure you want to clear all saved SPL CC comments?")) {
                                clearAllSavedSplCcComments();
                                setSavedSplCcList([]);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-colors font-medium cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Clear Archive</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (savedSplCcList.length === 0) return;
                            const success = exportSplCcCommentsToExcel(savedSplCcList);
                            if (success) {
                              setExportNotice('Excel file downloaded with Customer Name, Address, Country, RPL Names & Comments.');
                              setTimeout(() => setExportNotice(null), 4000);
                            }
                          }}
                          disabled={savedSplCcList.length === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
                          title={savedSplCcList.length === 0 ? "No SPL CC comments saved yet" : "Download saved comments as Excel file"}
                        >
                          <Download size={14} />
                          <span>Download Excel (.xlsx)</span>
                        </button>
                      </div>
                    </div>

                    {exportNotice && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
                        <Check size={14} strokeWidth={3} className="text-emerald-600 flex-shrink-0" />
                        <span>{exportNotice}</span>
                      </div>
                    )}

                    {/* Filter and Cards List */}
                    {savedSplCcList.length > 0 ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={splCcSearch}
                            onChange={(e) => setSplCcSearch(e.target.value)}
                            placeholder="Filter by customer name, address, country, RPL names, or comment text..."
                            className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                          />
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                          {savedSplCcList
                            .filter(item => {
                              if (!splCcSearch.trim()) return true;
                              const q = splCcSearch.toLowerCase();
                              return (
                                (item.customerName || '').toLowerCase().includes(q) ||
                                (item.address || '').toLowerCase().includes(q) ||
                                (item.country || '').toLowerCase().includes(q) ||
                                (item.rplNames || '').toLowerCase().includes(q) ||
                                (item.comments || '').toLowerCase().includes(q) ||
                                (item.posnr || '').toLowerCase().includes(q)
                              );
                            })
                            .map((item) => (
                              <div 
                                key={item.id} 
                                className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all text-xs space-y-2"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 text-xs">
                                      {item.customerName || '[No Customer Name]'}
                                    </span>
                                    {item.posnr && (
                                      <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md font-semibold">
                                        #{item.posnr}
                                      </span>
                                    )}
                                    {item.country && (
                                      <span className="font-bold text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
                                        {item.country}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = deleteSavedSplCcComment(item.id);
                                      setSavedSplCcList(updated);
                                    }}
                                    title="Delete this saved comment"
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                                  {item.address && (
                                    <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                                      <span className="font-semibold text-slate-500 block mb-0.5">Address:</span>
                                      <span className="text-slate-800 break-words">{item.address}</span>
                                    </div>
                                  )}

                                  {item.rplNames && (
                                    <div className="bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                                      <span className="font-semibold text-slate-500 block mb-0.5">RPL Names:</span>
                                      <span className="text-slate-800 italic break-words">{item.rplNames}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-800 font-mono break-words leading-relaxed">
                                  {item.comments}
                                </div>

                                <div className="text-[10px] text-slate-400 text-right">
                                  Saved on: {item.savedAt}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center rounded-2xl bg-white border border-dashed border-slate-200 space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                          <FileSpreadsheet size={22} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">
                          No Saved SPL CC Comments Yet
                        </h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                          In Live Processing, click the bookmark/save icon next to any case comment to archive it here. You can then download all records as a formatted Excel spreadsheet at any time.
                        </p>
                      </div>
                    )}

                  </div>
                )}

                {/* TAB 2: ACCESS & SECURITY */}
                {settingsActiveTab === 'security' && (
                  <div className="space-y-4">

                    {/* Section: Live Processing Password Lock */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isLiveLockEnabled ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {isLiveLockEnabled ? <Lock size={15} /> : <Unlock size={15} />}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">
                              Live Processing Password Lock
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Requires password entry before opening Live Processing
                            </span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isLiveLockEnabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isLiveLockEnabled ? (isLiveUnlocked ? 'Enabled (Unlocked)' : 'Locked') : 'Disabled'}
                        </span>
                      </div>

                      <form onSubmit={handleToggleLockSetting} className="space-y-3 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={settingsTogglePassword}
                            onChange={(e) => {
                              setSettingsTogglePassword(e.target.value);
                              setSettingsToggleError(null);
                              setSettingsToggleSuccess(null);
                            }}
                            placeholder="Enter current password to change lock state..."
                            className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                          />
                          <button
                            type="submit"
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs ${
                              isLiveLockEnabled
                                ? 'bg-slate-800 hover:bg-slate-900 text-white'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            {isLiveLockEnabled ? 'Disable Lock' : 'Enable Lock'}
                          </button>
                        </div>

                        {isLiveLockEnabled && isLiveUnlocked && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setIsLiveUnlocked(false);
                                if (activeTab === 'live_processing') {
                                  setActiveTab('processor');
                                }
                                setSettingsToggleSuccess('Live Processing has been locked.');
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                            >
                              <Lock size={12} />
                              <span>Lock Live Processing Now</span>
                            </button>
                          </div>
                        )}

                        {settingsToggleError && (
                          <p className="text-xs text-rose-600 font-medium">{settingsToggleError}</p>
                        )}
                        {settingsToggleSuccess && (
                          <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                            <Check size={13} strokeWidth={3} />
                            <span>{settingsToggleSuccess}</span>
                          </p>
                        )}
                      </form>
                    </div>

                    {/* Section: Change Password */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <KeyRound size={15} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">
                            Change Password
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Update the unlock password for Live Processing
                          </span>
                        </div>
                      </div>

                      <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Current Password
                          </label>
                          <input
                            type="password"
                            value={currentPwdInput}
                            onChange={(e) => {
                              setCurrentPwdInput(e.target.value);
                              setPwdChangeError(null);
                              setPwdChangeSuccess(null);
                            }}
                            placeholder="Enter current password..."
                            className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              New Password
                            </label>
                            <input
                              type="password"
                              value={newPwdInput}
                              onChange={(e) => {
                                setNewPwdInput(e.target.value);
                                setPwdChangeError(null);
                                setPwdChangeSuccess(null);
                              }}
                              placeholder="New password..."
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Confirm Password
                            </label>
                            <input
                              type="password"
                              value={confirmPwdInput}
                              onChange={(e) => {
                                setConfirmPwdInput(e.target.value);
                                setPwdChangeError(null);
                                setPwdChangeSuccess(null);
                              }}
                              placeholder="Confirm new password..."
                              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white"
                            />
                          </div>
                        </div>

                        {pwdChangeError && (
                          <p className="text-xs text-rose-600 font-medium">{pwdChangeError}</p>
                        )}
                        {pwdChangeSuccess && (
                          <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                            <Check size={13} strokeWidth={3} />
                            <span>{pwdChangeSuccess}</span>
                          </p>
                        )}

                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                          >
                            Update Password
                          </button>
                        </div>
                      </form>
                    </div>

                  </div>
                )}

              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
