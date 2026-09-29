import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, 
  Download, 
  Search, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Check, 
  RotateCcw, 
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  X,
  MessageSquare,
  ArrowLeft,
  Settings
} from 'lucide-react';
import * as XLSX from 'xlsx';

export type LiveActionType = 
  | 'SPLF'
  | 'SPLF(CC)'
  | 'No add'
  | 'SPLE'
  | 'ZKWD'
  | 'EMBF'
  | 'EMBN'
  | 'CN'
  | 'BLOC'
  | 'Escalate';

export interface ActionButtonDef {
  key: LiveActionType;
  label: string;
  shortcut: string;
  description: string;
  colorTheme: {
    badge: string;
    normal: string;
    active: string;
    dot: string;
  };
}

export const ACTION_BUTTON_CONFIG: ActionButtonDef[] = [
  {
    key: 'SPLF',
    label: 'SPLF',
    shortcut: '1',
    description: 'False match',
    colorTheme: {
      badge: 'bg-green-100 text-green-900 border-green-300 font-bold',
      normal: 'hover:border-green-500 hover:bg-green-50 text-green-900 border-green-300 bg-green-50/40',
      active: 'bg-green-600 text-white border-green-700 ring-2 ring-green-300 shadow-sm',
      dot: 'bg-green-500',
    },
  },
  {
    key: 'SPLF(CC)',
    label: 'SPLF(CC)',
    shortcut: '2',
    description: 'Comprehensive comment',
    colorTheme: {
      badge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
      normal: 'hover:border-emerald-500 hover:bg-emerald-50 text-emerald-900 border-emerald-300 bg-emerald-50/40',
      active: 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300 shadow-sm',
      dot: 'bg-emerald-500',
    },
  },
  {
    key: 'No add',
    label: 'No add',
    shortcut: '3',
    description: 'No Address / Cleared',
    colorTheme: {
      badge: 'bg-blue-100 text-blue-900 border-blue-300 font-bold',
      normal: 'hover:border-blue-500 hover:bg-blue-50 text-blue-900 border-blue-300 bg-blue-50/40',
      active: 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-sm',
      dot: 'bg-blue-500',
    },
  },
  {
    key: 'SPLE',
    label: 'SPLE',
    shortcut: '4',
    description: 'Exemption',
    colorTheme: {
      badge: 'bg-green-100 text-green-900 border-green-300 font-bold',
      normal: 'hover:border-green-500 hover:bg-green-50 text-green-900 border-green-300 bg-green-50/40',
      active: 'bg-green-600 text-white border-green-700 ring-2 ring-green-300 shadow-sm',
      dot: 'bg-green-500',
    },
  },
  {
    key: 'ZKWD',
    label: 'ZKWD',
    shortcut: '5',
    description: 'Keyword Match Review',
    colorTheme: {
      badge: 'bg-orange-100 text-orange-900 border-orange-300 font-bold',
      normal: 'hover:border-orange-500 hover:bg-orange-50 text-orange-950 border-orange-300 bg-orange-50/40',
      active: 'bg-orange-500 text-white border-orange-600 ring-2 ring-orange-300 shadow-sm',
      dot: 'bg-orange-500',
    },
  },
  {
    key: 'EMBF',
    label: 'EMBF',
    shortcut: '6',
    description: 'Embargo Found',
    colorTheme: {
      badge: 'bg-yellow-100 text-yellow-950 border-yellow-300 font-bold',
      normal: 'hover:border-yellow-500 hover:bg-yellow-50 text-yellow-950 border-yellow-300 bg-yellow-50/50',
      active: 'bg-yellow-500 text-slate-950 font-black border-yellow-600 ring-2 ring-yellow-300 shadow-sm',
      dot: 'bg-yellow-500',
    },
  },
  {
    key: 'EMBN',
    label: 'EMBN',
    shortcut: '7',
    description: 'Embassy, consulate army in ZEMB',
    colorTheme: {
      badge: 'bg-yellow-100 text-yellow-950 border-yellow-300 font-bold',
      normal: 'hover:border-yellow-500 hover:bg-yellow-50 text-yellow-950 border-yellow-300 bg-yellow-50/50',
      active: 'bg-yellow-500 text-slate-950 font-black border-yellow-600 ring-2 ring-yellow-300 shadow-sm',
      dot: 'bg-yellow-500',
    },
  },
  {
    key: 'CN',
    label: 'CN',
    shortcut: '8',
    description: 'Country Notification',
    colorTheme: {
      badge: 'bg-slate-200 text-slate-800 border-slate-300 font-bold',
      normal: 'hover:border-slate-400 hover:bg-slate-100 text-slate-800 border-slate-300 bg-slate-50',
      active: 'bg-slate-600 text-white border-slate-700 ring-2 ring-slate-300 shadow-sm',
      dot: 'bg-slate-500',
    },
  },
  {
    key: 'BLOC',
    label: 'BLOC',
    shortcut: '9',
    description: 'Blocked Transaction',
    colorTheme: {
      badge: 'bg-red-100 text-red-900 border-red-300 font-bold',
      normal: 'hover:border-red-500 hover:bg-red-50 text-red-900 border-red-300 bg-red-50/40',
      active: 'bg-red-600 text-white border-red-700 ring-2 ring-red-300 shadow-sm',
      dot: 'bg-red-600',
    },
  },
  {
    key: 'Escalate',
    label: 'Escalate',
    shortcut: '0',
    description: 'Escalate for further compliance review',
    colorTheme: {
      badge: 'bg-purple-100 text-purple-900 border-purple-300 font-bold',
      normal: 'hover:border-purple-500 hover:bg-purple-50 text-purple-900 border-purple-300 bg-purple-50/40',
      active: 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-300 shadow-sm',
      dot: 'bg-purple-600',
    },
  },
];

export interface LiveRplEntry {
  rowIndex: number;
  sequenceNo: string;
  rplName: string;
  match: string;
  typeOfList: string;
  status: string;
  country: string;
  street: string;
  city: string;
  postalCode: string;
  state: string;
  splId: string;
  rplScreeningStatus: string;
  rplStreet1: string;
  rawRow: any[];
}

export interface LiveProcessingCase {
  caseId: string;
  caseNumber: number;
  posnr: string;
  customerName: string;
  partnerId: string;
  country: string;
  status: string;
  street?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  isNoAdd?: boolean;
  rplEntries: LiveRplEntry[];
  action: LiveActionType | null;
  actionTimestamp?: string;
  notes?: string;
}

// 100% Exact match helper
export const isExact100Match = (customerName: string, rplName: string): boolean => {
  if (!customerName || !rplName) return false;
  const c = customerName.trim().toLowerCase().replace(/\s+/g, ' ');
  const r = rplName.trim().toLowerCase().replace(/\s+/g, ' ');
  return c.length > 0 && c === r;
};

// Keywords triggering Red Name Box: ZKWD, ZEMB, APRV
export const RED_ALERT_KEYWORDS = ['ZKWD', 'ZEMB', 'APRV'];

export const isRedNameMatch = (customerName?: string, status?: string): boolean => {
  const testVal = (val?: string): boolean => {
    if (!val) return false;
    const clean = val.toUpperCase().trim();
    if (!clean) return false;
    
    return RED_ALERT_KEYWORDS.some(kw => {
      if (clean === kw) return true;
      const escaped = kw.replace(/\s+/g, '[\\s-_]+');
      const regex = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i');
      return regex.test(clean);
    });
  };

  return testVal(customerName) || testVal(status);
};

export const getRedMatchedKeyword = (customerName?: string, status?: string): string => {
  const findKw = (val?: string): string | null => {
    if (!val) return null;
    const clean = val.toUpperCase().trim();
    for (const kw of RED_ALERT_KEYWORDS) {
      if (clean === kw) return kw;
      const escaped = kw.replace(/\s+/g, '[\\s-_]+');
      const regex = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i');
      if (regex.test(clean)) return kw;
    }
    return null;
  };

  return findKw(customerName) || findKw(status) || 'ALERT';
};

// Keywords or blank E,F,G / address columns triggering Blue NO add Box
export const isNoAddMatch = (
  customerName?: string,
  status?: string,
  isNoAddFlag?: boolean
): boolean => {
  if (isNoAddFlag) return true;

  const testNoAdd = (val?: string): boolean => {
    if (!val) return false;
    const clean = val.toUpperCase().trim();
    if (!clean) return false;
    if (clean === 'NO ADD' || clean === 'NOADD' || clean === 'NO-ADD' || clean === 'NO_ADD') return true;
    const regex = /(^|[^A-Z0-9])NO[\s-_]*ADD([^A-Z0-9]|$)/i;
    return regex.test(clean);
  };

  return testNoAdd(customerName) || testNoAdd(status);
};

export const getCustomerBoxTheme = (
  action: LiveActionType | null,
  customerName?: string,
  status?: string,
  isNoAddFlag?: boolean
) => {
  // SPLF, SPLFcc, SPLE: green color and customer name box animates green
  if (action === 'SPLF' || action === 'SPLF(CC)' || action === 'SPLE') {
    return {
      type: 'green' as const,
      containerClass: 'border-2 border-green-500 bg-green-50/95 shadow-md ring-2 ring-green-400/50 animate-green-pulse',
      posnrClass: 'bg-green-600',
      badge: {
        text: action,
        className: 'bg-green-600 text-white shadow-2xs animate-pulse',
        isAlert: false,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-green-100/90 border border-green-300 shadow-2xs',
      labelClass: 'text-green-800 font-extrabold',
      nameClass: 'text-green-950 font-black',
      statusBadgeClass: 'bg-green-600 text-white border-green-700 font-black',
      subBorderClass: 'border-green-200/80 text-green-900/80',
      subLabelClass: 'text-green-700/80 font-medium',
      countryBadgeClass: 'bg-green-100 text-green-900 border border-green-200',
      countryPinClass: 'text-green-600',
      actionLabelClass: 'text-green-700',
      actionBorderClass: 'border-green-200/80',
    };
  }

  // No add action: blue color
  if (action === 'No add') {
    return {
      type: 'blue' as const,
      containerClass: 'border-2 border-blue-500 bg-blue-50/95 shadow-md ring-2 ring-blue-300/60',
      posnrClass: 'bg-blue-600',
      badge: {
        text: 'No add',
        className: 'bg-blue-600 text-white shadow-2xs',
        isAlert: false,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-blue-100/85 border border-blue-300 shadow-2xs',
      labelClass: 'text-blue-800 font-extrabold',
      nameClass: 'text-blue-950 font-black',
      statusBadgeClass: 'bg-blue-600 text-white border-blue-700 font-black',
      subBorderClass: 'border-blue-200/80 text-blue-900/80',
      subLabelClass: 'text-blue-700/80 font-medium',
      countryBadgeClass: 'bg-blue-100 text-blue-900 border border-blue-200',
      countryPinClass: 'text-blue-600',
      actionLabelClass: 'text-blue-700',
      actionBorderClass: 'border-blue-200/80',
    };
  }

  // ZKWD action: orange color
  if (action === 'ZKWD') {
    return {
      type: 'orange' as const,
      containerClass: 'border-2 border-orange-500 bg-orange-50/95 shadow-md ring-2 ring-orange-300/60',
      posnrClass: 'bg-orange-500',
      badge: {
        text: 'ZKWD',
        className: 'bg-orange-500 text-white shadow-2xs',
        isAlert: false,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-orange-100/85 border border-orange-300 shadow-2xs',
      labelClass: 'text-orange-900 font-extrabold',
      nameClass: 'text-orange-950 font-black',
      statusBadgeClass: 'bg-orange-500 text-white border-orange-600 font-black',
      subBorderClass: 'border-orange-200/80 text-orange-900/80',
      subLabelClass: 'text-orange-800/80 font-medium',
      countryBadgeClass: 'bg-orange-100 text-orange-900 border border-orange-200',
      countryPinClass: 'text-orange-600',
      actionLabelClass: 'text-orange-700',
      actionBorderClass: 'border-orange-200/80',
    };
  }

  // EMBF & EMBN action: yellow color
  if (action === 'EMBF' || action === 'EMBN') {
    return {
      type: 'yellow' as const,
      containerClass: 'border-2 border-yellow-400 bg-yellow-50/95 shadow-md ring-2 ring-yellow-300/60',
      posnrClass: 'bg-yellow-500 text-slate-950 font-black',
      badge: {
        text: action,
        className: 'bg-yellow-500 text-slate-950 font-black shadow-2xs',
        isAlert: false,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-yellow-100/85 border border-yellow-300 shadow-2xs',
      labelClass: 'text-yellow-900 font-extrabold',
      nameClass: 'text-yellow-950 font-black',
      statusBadgeClass: 'bg-yellow-500 text-slate-950 border-yellow-600 font-black',
      subBorderClass: 'border-yellow-200/80 text-yellow-900/80',
      subLabelClass: 'text-yellow-800/80 font-medium',
      countryBadgeClass: 'bg-yellow-100 text-yellow-900 border border-yellow-200',
      countryPinClass: 'text-yellow-600',
      actionLabelClass: 'text-yellow-800',
      actionBorderClass: 'border-yellow-200/80',
    };
  }

  // CN action: grey color
  if (action === 'CN') {
    return {
      type: 'grey' as const,
      containerClass: 'border-2 border-slate-400 bg-slate-100/90 shadow-md ring-2 ring-slate-300/60',
      posnrClass: 'bg-slate-600',
      badge: {
        text: 'CN',
        className: 'bg-slate-600 text-white shadow-2xs',
        isAlert: false,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-slate-200/85 border border-slate-300 shadow-2xs',
      labelClass: 'text-slate-700 font-extrabold',
      nameClass: 'text-slate-900 font-black',
      statusBadgeClass: 'bg-slate-600 text-white border-slate-700 font-black',
      subBorderClass: 'border-slate-300/80 text-slate-700',
      subLabelClass: 'text-slate-600 font-medium',
      countryBadgeClass: 'bg-slate-200 text-slate-800 border border-slate-300',
      countryPinClass: 'text-slate-500',
      actionLabelClass: 'text-slate-700',
      actionBorderClass: 'border-slate-300/80',
    };
  }

  // BLOC action: red color
  if (action === 'BLOC') {
    return {
      type: 'red' as const,
      containerClass: 'border-2 border-red-600 bg-red-50/95 shadow-md ring-2 ring-red-400/60',
      posnrClass: 'bg-red-600',
      badge: {
        text: 'BLOC',
        className: 'bg-red-600 text-white shadow-2xs',
        isAlert: true,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-red-100/90 border border-red-300 shadow-2xs',
      labelClass: 'text-red-700 font-extrabold',
      nameClass: 'text-red-950 font-black',
      statusBadgeClass: 'bg-red-600 text-white border-red-700 font-black',
      subBorderClass: 'border-red-200/80 text-red-900/80',
      subLabelClass: 'text-red-700/80 font-medium',
      countryBadgeClass: 'bg-red-100 text-red-900 border border-red-200',
      countryPinClass: 'text-red-600',
      actionLabelClass: 'text-red-700',
      actionBorderClass: 'border-red-200/80',
    };
  }

  // Escalate action: purple color
  if (action === 'Escalate') {
    return {
      type: 'purple' as const,
      containerClass: 'border-2 border-purple-500 bg-purple-50/95 shadow-md ring-2 ring-purple-300/60',
      posnrClass: 'bg-purple-600',
      badge: {
        text: 'Escalate',
        className: 'bg-purple-600 text-white shadow-2xs',
        isAlert: true,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-purple-100/90 border border-purple-300 shadow-2xs',
      labelClass: 'text-purple-800 font-extrabold',
      nameClass: 'text-purple-950 font-black',
      statusBadgeClass: 'bg-purple-600 text-white border-purple-700 font-black',
      subBorderClass: 'border-purple-200/80 text-purple-900/80',
      subLabelClass: 'text-purple-700/80 font-medium',
      countryBadgeClass: 'bg-purple-100 text-purple-900 border border-purple-200',
      countryPinClass: 'text-purple-600',
      actionLabelClass: 'text-purple-700',
      actionBorderClass: 'border-purple-200/80',
    };
  }

  // 1. If no action assigned yet: check if ZKWD, ZEMB, APRV in name/status -> RED
  const isRedAlert = isRedNameMatch(customerName, status);
  if (isRedAlert) {
    const kw = getRedMatchedKeyword(customerName, status);
    return {
      type: 'red-alert' as const,
      containerClass: 'border-2 border-red-500 bg-red-50/95 shadow-md ring-2 ring-red-300/70',
      posnrClass: 'bg-red-600',
      badge: {
        text: `${kw} Detected`,
        className: 'bg-red-600 text-white shadow-2xs animate-pulse',
        isAlert: true,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-red-100/90 border border-red-300 shadow-2xs',
      labelClass: 'text-red-700 font-extrabold',
      nameClass: 'text-red-950 font-black',
      statusBadgeClass: 'bg-red-600 text-white border-red-700 font-black',
      subBorderClass: 'border-red-200/80 text-red-900/80',
      subLabelClass: 'text-red-700/80 font-medium',
      countryBadgeClass: 'bg-red-100 text-red-900 border border-red-200',
      countryPinClass: 'text-red-600',
      actionLabelClass: 'text-red-700',
      actionBorderClass: 'border-red-200/80',
    };
  }

  // 2. If E, F, G columns (or address columns) are blank or NO add in status/name -> BLUE ("NO add" in blue as how it shows red for ZKWD)
  const isBlueAlert = isNoAddMatch(customerName, status, isNoAddFlag);
  if (isBlueAlert) {
    return {
      type: 'blue-alert' as const,
      containerClass: 'border-2 border-blue-500 bg-blue-50/95 shadow-md ring-2 ring-blue-300/70',
      posnrClass: 'bg-blue-600',
      badge: {
        text: 'NO add',
        className: 'bg-blue-600 text-white shadow-2xs animate-pulse',
        isAlert: true,
      },
      nameCardClass: 'p-3.5 rounded-xl bg-blue-100/90 border border-blue-300 shadow-2xs',
      labelClass: 'text-blue-700 font-extrabold',
      nameClass: 'text-blue-950 font-black',
      statusBadgeClass: 'bg-blue-600 text-white border-blue-700 font-black',
      subBorderClass: 'border-blue-200/80 text-blue-900/80',
      subLabelClass: 'text-blue-700/80 font-medium',
      countryBadgeClass: 'bg-blue-100 text-blue-900 border border-blue-200',
      countryPinClass: 'text-blue-600',
      actionLabelClass: 'text-blue-700',
      actionBorderClass: 'border-blue-200/80',
    };
  }

  // Default clean state
  return {
    type: 'default' as const,
    containerClass: 'border border-slate-200 bg-slate-50/50 shadow-2xs',
    posnrClass: 'bg-indigo-600',
    badge: null,
    nameCardClass: 'p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs',
    labelClass: 'text-slate-400 font-bold',
    nameClass: 'text-slate-900 font-bold',
    statusBadgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    subBorderClass: 'border-slate-200/60 text-slate-600',
    subLabelClass: 'text-slate-400 font-medium',
    countryBadgeClass: 'bg-slate-200/80 text-slate-800',
    countryPinClass: 'text-slate-500',
    actionLabelClass: 'text-slate-400',
    actionBorderClass: 'border-slate-200/80',
  };
};

export const getSidebarItemStyle = (
  action: LiveActionType | null,
  isRedItem: boolean,
  isBlueNoAddItem: boolean,
  isSelected: boolean
) => {
  if (action === 'SPLF' || action === 'SPLF(CC)' || action === 'SPLE') {
    return isSelected 
      ? 'bg-green-100/80 border-l-green-600 shadow-2xs' 
      : 'border-l-green-500 bg-green-50/40 hover:bg-green-100/40';
  }
  if (action === 'No add') {
    return isSelected 
      ? 'bg-blue-100/80 border-l-blue-600 shadow-2xs' 
      : 'border-l-blue-500 bg-blue-50/40 hover:bg-blue-100/40';
  }
  if (action === 'ZKWD') {
    return isSelected 
      ? 'bg-orange-100/80 border-l-orange-600 shadow-2xs' 
      : 'border-l-orange-500 bg-orange-50/40 hover:bg-orange-100/40';
  }
  if (action === 'EMBF' || action === 'EMBN') {
    return isSelected 
      ? 'bg-yellow-100/80 border-l-yellow-500 shadow-2xs' 
      : 'border-l-yellow-400 bg-yellow-50/40 hover:bg-yellow-100/40';
  }
  if (action === 'CN') {
    return isSelected 
      ? 'bg-slate-200/80 border-l-slate-600 shadow-2xs' 
      : 'border-l-slate-400 bg-slate-100/60 hover:bg-slate-200/50';
  }
  if (action === 'BLOC') {
    return isSelected 
      ? 'bg-red-100/80 border-l-red-600 shadow-2xs' 
      : 'border-l-red-600 bg-red-50/40 hover:bg-red-100/40';
  }
  if (action === 'Escalate') {
    return isSelected 
      ? 'bg-purple-100/80 border-l-purple-600 shadow-2xs' 
      : 'border-l-purple-600 bg-purple-50/40 hover:bg-purple-100/40';
  }
  if (isRedItem) {
    return isSelected 
      ? 'bg-red-100/70 border-l-red-600 shadow-2xs' 
      : 'bg-red-50/70 border-l-red-500 hover:bg-red-100/50';
  }
  if (isBlueNoAddItem) {
    return isSelected 
      ? 'bg-blue-100/75 border-l-blue-600 shadow-2xs' 
      : 'bg-blue-50/70 border-l-blue-500 hover:bg-blue-100/50';
  }
  return isSelected 
    ? 'bg-indigo-50 border-l-indigo-600 shadow-2xs' 
    : 'border-l-transparent hover:bg-slate-50';
};

interface LiveProcessingProps {
  initialFile?: File | null;
  initialProcessedRows?: any[][] | null;
  initialFileName?: string | null;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

export const LiveProcessing: React.FC<LiveProcessingProps> = ({
  initialFile = null,
  initialProcessedRows = null,
  initialFileName = null,
  onBack,
  onOpenSettings,
}) => {
  const [file, setFile] = useState<File | null>(initialFile);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw file structure
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawDataRows, setRawDataRows] = useState<any[][]>([]);
  
  // Parsed 1-by-1 Cases
  const [cases, setCases] = useState<LiveProcessingCase[]>([]);
  const [currentCaseIndex, setCurrentCaseIndex] = useState(0);

  // Collapsible sidebar state (collapsed by default)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Review preferences & filter
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'reviewed' | LiveActionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rplSearchQuery, setRplSearchQuery] = useState('');
  const [caseNote, setCaseNote] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset RPL search query whenever active case changes
  useEffect(() => {
    setRplSearchQuery('');
  }, [currentCaseIndex]);

  // If initialProcessedRows is passed in from Processor tab
  useEffect(() => {
    if (initialProcessedRows && initialProcessedRows.length > 1) {
      const headers = initialProcessedRows[0].map(h => String(h ?? ''));
      const rows = initialProcessedRows.slice(1);
      setRawHeaders(headers);
      setRawDataRows(rows);
      buildCasesFromRows(headers, rows);
    }
  }, [initialProcessedRows]);

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selected = e.target.files[0];
    setFile(selected);
    setError(null);
    setParsing(true);

    try {
      const arrayBuffer = await selected.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      setAvailableSheets(wb.SheetNames);
      
      const targetSheet = wb.SheetNames.find(s => s.toLowerCase().includes('sheet 2') || s.toLowerCase().includes('sheet2'))
        || wb.SheetNames[0]
        || '';
      setSelectedSheet(targetSheet);

      loadSheetData(wb, targetSheet);
    } catch (err: any) {
      console.error('Failed to parse file:', err);
      setError(err?.message || 'Failed to parse the selected file.');
    } finally {
      setParsing(false);
    }
  };

  const loadSheetData = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      throw new Error(`Sheet "${sheetName}" not found.`);
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (!rows || rows.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty.`);
    }

    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i] || [];
      const hasKeyHeaders = row.some(cell => {
        const str = String(cell || '').toLowerCase();
        return str.includes('posnr') || str.includes('rpl') || str.includes('partner');
      });
      if (hasKeyHeaders) {
        headerRowIdx = i;
        break;
      }
    }

    const headers = (rows[headerRowIdx] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
    const dataRows = rows.slice(headerRowIdx + 1).filter(r => r && r.some(cell => String(cell || '').trim() !== ''));

    setRawHeaders(headers);
    setRawDataRows(dataRows);
    buildCasesFromRows(headers, dataRows);
  };

  const findCol = (headers: string[], names: string[], excludes: string[] = []): number => {
    const cleanNames = names.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const cleanExcludes = excludes.map(e => e.toLowerCase().replace(/[^a-z0-9]/g, ''));

    for (let i = 0; i < headers.length; i++) {
      const hClean = headers[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanExcludes.some(ex => hClean.includes(ex))) continue;
      if (cleanNames.some(name => hClean === name || hClean.includes(name))) {
        return i;
      }
    }
    return -1;
  };

  const buildCasesFromRows = (headers: string[], rows: any[][]) => {
    const posnrIdx = findCol(headers, ['posnr', 'item', 'line', 'refno']);
    const nameIdx = findCol(headers, ['name', 'customername', 'partnername'], ['rpl', 'file']);
    const rplIdx = findCol(headers, ['rplname', 'rpl', 'sanctionedname', 'rpl1']);
    const matchIdx = findCol(headers, ['match', 'keywordmatch', 'commonkeyword']);
    const statusIdx = findCol(headers, ['status', 'stat']);
    const seqIdx = findCol(headers, ['sequenceno', 'seqno', 'sequence']);
    const countryIdx = findCol(headers, ['country', 'land', 'ctr']);
    const partnerIdIdx = findCol(headers, ['partnerid', 'partnerno', 'partner']);
    const streetIdx = findCol(headers, ['street', 'address', 'address1'], ['rpl']);
    const cityIdx = findCol(headers, ['city', 'town']);
    const postalCodeIdx = findCol(headers, ['postalcode', 'postcode', 'zip']);
    const typeOfListIdx = findCol(headers, ['typeoflist', 'listtype', 'list']);
    const splIdIdx = findCol(headers, ['splid', 'spl']);
    const screeningStatusIdx = findCol(headers, ['rplscreeningstatus', 'screeningstatus']);
    const rplStreetIdx = findCol(headers, ['rplstreet1', 'rplstreet']);
    const stateIdx = findCol(headers, ['state', 'region', 'province']);
    const actionColIdx = findCol(headers, ['action', 'reviewaction', 'review']);
    const notesColIdx = findCol(headers, ['reviewnotes', 'notes', 'comment', 'comments', 'remark', 'remarks']);

    const builtCases: LiveProcessingCase[] = [];
    let currentCase: LiveProcessingCase | null = null;
    let caseCounter = 1;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx] || [];
      const rawPosnr = posnrIdx >= 0 ? String(row[posnrIdx] ?? '').trim() : '';
      const rawName = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
      const rawRpl = rplIdx >= 0 ? String(row[rplIdx] ?? '').trim() : '';
      const rawMatch = matchIdx >= 0 ? String(row[matchIdx] ?? '').trim() : '';
      const rawStatus = statusIdx >= 0 ? String(row[statusIdx] ?? '').trim() : '';
      const rawSeq = seqIdx >= 0 ? String(row[seqIdx] ?? '').trim() : '';
      const rawCountry = countryIdx >= 0 ? String(row[countryIdx] ?? '').trim() : '';
      const rawPartnerId = partnerIdIdx >= 0 ? String(row[partnerIdIdx] ?? '').trim() : '';
      const rawStreet = streetIdx >= 0 ? String(row[streetIdx] ?? '').trim() : '';
      const rawCity = cityIdx >= 0 ? String(row[cityIdx] ?? '').trim() : '';
      const rawPostalCode = postalCodeIdx >= 0 ? String(row[postalCodeIdx] ?? '').trim() : '';
      const rawTypeOfList = typeOfListIdx >= 0 ? String(row[typeOfListIdx] ?? '').trim() : '';
      const rawSplId = splIdIdx >= 0 ? String(row[splIdIdx] ?? '').trim() : '';
      const rawScreeningStatus = screeningStatusIdx >= 0 ? String(row[screeningStatusIdx] ?? '').trim() : '';
      const rawRplStreet = rplStreetIdx >= 0 ? String(row[rplStreetIdx] ?? '').trim() : '';
      const rawState = stateIdx >= 0 ? String(row[stateIdx] ?? '').trim() : '';
      const rawExistingAction = actionColIdx >= 0 ? String(row[actionColIdx] ?? '').trim() : '';
      const rawExistingNote = notesColIdx >= 0 ? String(row[notesColIdx] ?? '').trim() : '';

      const isSeqOne = rawSeq === '1' || rawSeq === '01' || rawSeq === '1.0';
      const posnrChanged = currentCase !== null && rawPosnr !== '' && rawPosnr !== currentCase.posnr;

      if (!currentCase || isSeqOne || posnrChanged) {
        if (currentCase) {
          builtCases.push(currentCase);
        }

        let initialAction: LiveActionType | null = null;
        if (rawExistingAction) {
          const matchedAct = ACTION_BUTTON_CONFIG.find(a => a.key.toLowerCase() === rawExistingAction.toLowerCase());
          if (matchedAct) {
            initialAction = matchedAct.key;
          }
        }

        currentCase = {
          caseId: `case-${caseCounter}`,
          caseNumber: caseCounter,
          posnr: rawPosnr || (currentCase ? currentCase.posnr : `Item ${caseCounter}`),
          customerName: rawName || '',
          partnerId: rawPartnerId,
          country: rawCountry,
          status: rawStatus,
          street: rawStreet,
          city: rawCity,
          postalCode: rawPostalCode,
          state: rawState,
          rplEntries: [],
          action: initialAction,
          notes: rawExistingNote || '',
        };
        caseCounter++;
      }

      if (!currentCase.notes && rawExistingNote) {
        currentCase.notes = rawExistingNote;
      }

      if (!currentCase.customerName && rawName) {
        currentCase.customerName = rawName;
      }
      if (!currentCase.status && rawStatus) {
        currentCase.status = rawStatus;
      }
      if (!currentCase.country && rawCountry) {
        currentCase.country = rawCountry;
      }
      if (!currentCase.street && rawStreet) currentCase.street = rawStreet;
      if (!currentCase.city && rawCity) currentCase.city = rawCity;
      if (!currentCase.postalCode && rawPostalCode) currentCase.postalCode = rawPostalCode;
      if (!currentCase.state && rawState) currentCase.state = rawState;

      currentCase.rplEntries.push({
        rowIndex: rIdx,
        sequenceNo: rawSeq,
        rplName: rawRpl,
        match: rawMatch,
        typeOfList: rawTypeOfList,
        status: rawStatus,
        country: rawCountry,
        street: rawStreet,
        city: rawCity,
        postalCode: rawPostalCode,
        state: rawState,
        splId: rawSplId,
        rplScreeningStatus: rawScreeningStatus,
        rplStreet1: rawRplStreet,
        rawRow: row,
      });
    }

    if (currentCase) {
      builtCases.push(currentCase);
    }

    // Evaluate "NO add" condition on each case:
    // If E, F, G columns (or mapped address columns street, city, postalCode) are blank,
    // mark as NO add so it displays in blue in Live Processing (just like ZKWD displays in red).
    const hasAddressCols = streetIdx >= 0 || cityIdx >= 0 || postalCodeIdx >= 0;
    const isEFGNotNameOrRpl =
      nameIdx !== 4 && nameIdx !== 5 && nameIdx !== 6 &&
      rplIdx !== 4 && rplIdx !== 5 && rplIdx !== 6;

    builtCases.forEach(c => {
      const isAddressBlank =
        hasAddressCols &&
        !(c.street || '').trim() &&
        !(c.city || '').trim() &&
        !(c.postalCode || '').trim();

      const isRawEFGBlank =
        isEFGNotNameOrRpl &&
        c.rplEntries.length > 0 &&
        c.rplEntries.every(entry => {
          const colE = String(entry.rawRow?.[4] ?? '').trim();
          const colF = String(entry.rawRow?.[5] ?? '').trim();
          const colG = String(entry.rawRow?.[6] ?? '').trim();
          return colE === '' && colF === '' && colG === '';
        });

      const alreadyNoAdd = isNoAddMatch(c.customerName, c.status, false);

      if (isAddressBlank || isRawEFGBlank || alreadyNoAdd) {
        c.isNoAdd = true;
        // If status does not already have a red alert keyword or NO add, set status to "NO add"
        if (!isRedNameMatch(c.customerName, c.status) && !alreadyNoAdd) {
          c.status = c.status ? `${c.status}, NO add` : 'NO add';
        }
      }
    });

    setCases(builtCases);
    setCurrentCaseIndex(0);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Keys 1-9 and 0 for quick decisions
      if (e.key === '0') {
        const escalateDef = ACTION_BUTTON_CONFIG.find(a => a.key === 'Escalate');
        if (escalateDef) {
          e.preventDefault();
          handleApplyAction(escalateDef.key);
        }
        return;
      }
      const keyNum = parseInt(e.key, 10);
      if (keyNum >= 1 && keyNum <= 9) {
        const actionDef = ACTION_BUTTON_CONFIG[keyNum - 1];
        if (actionDef) {
          e.preventDefault();
          handleApplyAction(actionDef.key);
        }
        return;
      }

      // Navigation shortcuts
      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault();
        handlePrevCase();
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault();
        handleNextCase();
      } else if (e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCaseIndex, cases, autoAdvance, filterMode]);

  // Sync current case note
  useEffect(() => {
    const c = cases[currentCaseIndex];
    setCaseNote(c?.notes || '');
  }, [currentCaseIndex, cases]);

  // Statistics
  const stats = useMemo(() => {
    const total = cases.length;
    const reviewed = cases.filter(c => c.action !== null).length;
    const pending = total - reviewed;
    const percent = total > 0 ? Math.round((reviewed / total) * 100) : 0;

    return { total, reviewed, pending, percent };
  }, [cases]);

  // Filtered cases for sidebar queue
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (filterMode === 'pending' && c.action !== null) return false;
      if (filterMode === 'reviewed' && c.action === null) return false;
      if (filterMode !== 'all' && filterMode !== 'pending' && filterMode !== 'reviewed') {
        if (c.action !== filterMode) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const posnrMatch = c.posnr.toLowerCase().includes(q);
        const nameMatch = c.customerName.toLowerCase().includes(q);
        const countryMatch = c.country.toLowerCase().includes(q);
        const rplMatch = c.rplEntries.some(r => 
          r.rplName.toLowerCase().includes(q) || 
          r.match.toLowerCase().includes(q) ||
          r.typeOfList.toLowerCase().includes(q)
        );
        if (!posnrMatch && !nameMatch && !countryMatch && !rplMatch) return false;
      }

      return true;
    });
  }, [cases, filterMode, searchQuery]);

  const activeCase: LiveProcessingCase | undefined = cases[currentCaseIndex];

  // Filtered RPL entries for active case based on rplSearchQuery
  const displayedRplEntries = useMemo(() => {
    if (!activeCase) return [];
    if (!rplSearchQuery.trim()) return activeCase.rplEntries;
    const q = rplSearchQuery.toLowerCase().trim();
    return activeCase.rplEntries.filter(entry => 
      (entry.rplName || '').toLowerCase().includes(q)
    );
  }, [activeCase, rplSearchQuery]);

  // Count of 100% exact matches in active case
  const exactMatchCount = useMemo(() => {
    if (!activeCase) return 0;
    return activeCase.rplEntries.filter(entry => 
      isExact100Match(activeCase.customerName, entry.rplName)
    ).length;
  }, [activeCase]);

  // Handle note/comment change reactively so it updates case instantly
  const handleNoteChange = (newNote: string) => {
    setCaseNote(newNote);
    if (!activeCase) return;
    setCases(prev => {
      const next = [...prev];
      next[currentCaseIndex] = {
        ...next[currentCaseIndex],
        notes: newNote,
      };
      return next;
    });
  };

  // Action assignment
  const handleApplyAction = (actionKey: LiveActionType) => {
    if (!activeCase) return;

    setCases(prev => {
      const next = [...prev];
      next[currentCaseIndex] = {
        ...next[currentCaseIndex],
        action: actionKey,
        actionTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        notes: caseNote,
      };
      return next;
    });

    if (autoAdvance) {
      setTimeout(() => {
        const nextPendingIndex = cases.findIndex((c, idx) => idx > currentCaseIndex && c.action === null);
        if (nextPendingIndex !== -1) {
          setCurrentCaseIndex(nextPendingIndex);
        } else if (currentCaseIndex < cases.length - 1) {
          setCurrentCaseIndex(currentCaseIndex + 1);
        }
      }, 120);
    }
  };

  const handleClearAction = () => {
    if (!activeCase) return;
    setCases(prev => {
      const next = [...prev];
      next[currentCaseIndex] = {
        ...next[currentCaseIndex],
        action: null,
        actionTimestamp: undefined,
      };
      return next;
    });
  };

  const handlePrevCase = () => {
    if (currentCaseIndex > 0) {
      setCurrentCaseIndex(currentCaseIndex - 1);
    }
  };

  const handleNextCase = () => {
    if (currentCaseIndex < cases.length - 1) {
      setCurrentCaseIndex(currentCaseIndex + 1);
    }
  };

  // Download reviewed Excel
  const handleDownloadReviewedExcel = () => {
    if (cases.length === 0 || rawHeaders.length === 0) return;

    const rowActionMap = new Map<number, string>();
    const rowNoteMap = new Map<number, string>();

    cases.forEach(c => {
      const actionText = c.action || '';
      const noteText = c.notes || '';
      c.rplEntries.forEach(rpl => {
        rowActionMap.set(rpl.rowIndex, actionText || noteText);
        if (noteText) {
          rowNoteMap.set(rpl.rowIndex, noteText);
        }
      });
    });

    const actionColIdx = rawHeaders.findIndex(h => h.toLowerCase().trim() === 'action');
    const notesColIdx = rawHeaders.findIndex(h => {
      const s = h.toLowerCase().trim();
      return s === 'review notes' || s === 'notes' || s === 'comment' || s === 'comments' || s === 'remarks' || s === 'remark';
    });

    let outputHeaders: string[];
    if (actionColIdx >= 0) {
      outputHeaders = [...rawHeaders];
    } else {
      outputHeaders = ['Action', ...rawHeaders];
    }

    if (notesColIdx < 0) {
      outputHeaders.push('Comments');
    }

    const reviewedRows: any[][] = [outputHeaders];

    rawDataRows.forEach((row, rIdx) => {
      const actionVal = rowActionMap.get(rIdx) || '';
      const noteVal = rowNoteMap.get(rIdx) || '';
      const newRow: any[] = [];

      if (actionColIdx >= 0) {
        for (let cI = 0; cI < row.length; cI++) {
          if (cI === actionColIdx) {
            newRow.push(actionVal);
          } else if (notesColIdx >= 0 && cI === notesColIdx) {
            newRow.push(noteVal || row[cI]);
          } else {
            newRow.push(row[cI]);
          }
        }
      } else {
        newRow.push(actionVal);
        for (let cI = 0; cI < row.length; cI++) {
          if (notesColIdx >= 0 && cI === notesColIdx) {
            newRow.push(noteVal || row[cI]);
          } else {
            newRow.push(row[cI]);
          }
        }
      }

      if (notesColIdx < 0) {
        newRow.push(noteVal);
      }

      reviewedRows.push(newRow);
    });

    const outWb = XLSX.utils.book_new();
    const outWs = XLSX.utils.aoa_to_sheet(reviewedRows);

    const colWidths = outputHeaders.map((hdr, colI) => {
      let maxLen = hdr.length;
      const sample = Math.min(reviewedRows.length, 100);
      for (let r = 1; r < sample; r++) {
        const val = reviewedRows[r]?.[colI];
        if (val !== null && val !== undefined) {
          const l = String(val).length;
          if (l > maxLen) maxLen = l;
        }
      }
      return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });
    outWs['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(outWb, outWs, 'Live_Reviewed');

    const excelBuf = XLSX.write(outWb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([new Uint8Array(excelBuf)], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = file?.name?.replace(/\.[^/.]+$/, '') || initialFileName?.replace(/\.[^/.]+$/, '') || 'Zyme_E4H';
    a.download = `${baseName}_Reviewed_Live.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null);
    setRawHeaders([]);
    setRawDataRows([]);
    setCases([]);
    setCurrentCaseIndex(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col w-full h-full overflow-hidden font-inter bg-white">
      <div className="w-full h-full flex-1 flex flex-col overflow-hidden">
        
        {/* FULL-SCREEN CONTAINER */}
        <div className="bg-white w-full h-full flex-1 overflow-hidden flex flex-col">
          
          {cases.length === 0 ? (
            // ==========================================
            // UPLOAD STATE FOR LIVE PROCESSING
            // ==========================================
            <div className="flex-1 flex items-center justify-center p-8 md:p-14 text-center h-full overflow-y-auto">
              <div className="max-w-lg mx-auto space-y-6">
                
                <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                  <SlidersHorizontal size={26} />
                </div>

                <div>
                  <div className="flex items-center justify-center gap-2">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                      Live Processing
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-2xs">
                      Beta
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
                    Upload your processed Zyme E4H file to review each Posnr and RPL hit one by one.
                  </p>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-9 cursor-pointer transition-all duration-200 bg-slate-50/50 hover:bg-indigo-50/20"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 group-hover:border-indigo-200 group-hover:shadow-2xs transition-all">
                      <Upload size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                        Click to upload Zyme E4H file
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Supports Excel (.xlsx, .xls) and CSV
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2 text-left">
                    <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

              </div>
            </div>
          ) : (
            // ==========================================
            // LIVE 1-BY-1 CLEAN FULL-SCREEN REVIEW
            // ==========================================
            <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
              
              {/* TOP SLIM HEADER BAR */}
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
                
                {/* Left: Back Button + Collapsible Sidebar Toggle + Item Counter */}
                <div className="flex items-center gap-2.5">
                  {onBack && (
                    <button
                      onClick={onBack}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-all"
                      title="Back to Zyme E4H New"
                    >
                      <ArrowLeft size={14} className="text-slate-600" />
                      <span>Back</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsSidebarOpen(prev => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-all"
                    title={isSidebarOpen ? "Collapse Item List (Press 'Q')" : "Expand Item List (Press 'Q')"}
                  >
                    {isSidebarOpen ? (
                      <>
                        <PanelLeftClose size={14} className="text-slate-600" />
                        <span className="text-xs">Hide List</span>
                      </>
                    ) : (
                      <>
                        <PanelLeftOpen size={14} className="text-indigo-600" />
                        <span className="text-xs font-bold text-indigo-700">Show List</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs tabular-nums">
                      Item {currentCaseIndex + 1} of {cases.length}
                    </span>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium tabular-nums">
                      <span>{stats.reviewed} reviewed</span>
                      <span aria-hidden="true">·</span>
                      <span>{stats.pending} left</span>
                    </div>
                  </div>
                </div>

                {/* Right: Prev / Next Navigation & Download & Settings */}
                <div className="flex items-center gap-2 flex-wrap">
                  
                  {/* Prev / Next Buttons */}
                  <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs overflow-hidden">
                    <button
                      onClick={handlePrevCase}
                      disabled={currentCaseIndex === 0}
                      className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors border-r border-slate-200 flex items-center gap-1 text-xs font-semibold"
                      title="Previous Item (Left Arrow or [)"
                    >
                      <ChevronLeft size={14} />
                      <span className="hidden md:inline">Prev</span>
                    </button>
                    <button
                      onClick={handleNextCase}
                      disabled={currentCaseIndex >= cases.length - 1}
                      className="px-2.5 py-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 text-xs font-semibold"
                      title="Next Item (Right Arrow or ])"
                    >
                      <span className="hidden md:inline">Next</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Download Reviewed Excel */}
                  <button
                    onClick={handleDownloadReviewedExcel}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
                    title="Download audited Excel (.xlsx) file"
                  >
                    <Download size={14} />
                    <span>Download Excel</span>
                  </button>

                  <button
                    onClick={handleReset}
                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-300 rounded-lg shadow-2xs transition-colors"
                    title="Upload another file"
                  >
                    <RefreshCw size={14} />
                  </button>

                  {onOpenSettings && (
                    <button
                      onClick={onOpenSettings}
                      className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 hover:text-indigo-600 border border-slate-300 rounded-lg shadow-2xs transition-colors"
                      title="Settings & Password Lock"
                    >
                      <Settings size={14} />
                    </button>
                  )}
                </div>

              </div>

              {/* DUAL WORKSPACE: COLLAPSIBLE LEFT DRAWER + MAIN SCREEN */}
              <div className="flex flex-1 min-h-0 relative overflow-hidden">
                
                {/* COLLAPSIBLE LEFT DRAWER: CASES QUEUE LIST */}
                {isSidebarOpen && (
                  <div className="w-72 sm:w-80 border-r border-slate-200 bg-slate-50/50 flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-200">
                    
                    {/* Search & Filter Header */}
                    <div className="p-2.5 border-b border-slate-200 space-y-2 bg-white flex-shrink-0">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          type="text"
                          placeholder="Search Posnr or Name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                        />
                      </div>

                      {/* Filter Mode Tabs */}
                      <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                        <button
                          onClick={() => setFilterMode('all')}
                          className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-colors tabular-nums ${
                            filterMode === 'all' 
                              ? 'bg-white text-slate-900 shadow-2xs' 
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          All ({cases.length})
                        </button>
                        <button
                          onClick={() => setFilterMode('pending')}
                          className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-colors tabular-nums ${
                            filterMode === 'pending' 
                              ? 'bg-white text-slate-900 shadow-2xs' 
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Pending ({stats.pending})
                        </button>
                        <button
                          onClick={() => setFilterMode('reviewed')}
                          className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-colors tabular-nums ${
                            filterMode === 'reviewed' 
                              ? 'bg-white text-slate-900 shadow-2xs' 
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Done ({stats.reviewed})
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Cases List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0 scrollbar-thin">
                      {filteredCases.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No items match your filter.
                        </div>
                      ) : (
                        filteredCases.map((c) => {
                          const actualIdx = cases.findIndex(orig => orig.caseId === c.caseId);
                          const isSelected = actualIdx === currentCaseIndex;
                          const isRedItem = isRedNameMatch(c.customerName, c.status);
                          const isBlueNoAddItem = !isRedItem && isNoAddMatch(c.customerName, c.status, c.isNoAdd);

                          return (
                            <div
                              key={c.caseId}
                              onClick={() => setCurrentCaseIndex(actualIdx)}
                              className={`p-2.5 cursor-pointer transition-all border-l-4 ${getSidebarItemStyle(c.action, isRedItem, isBlueNoAddItem, isSelected)}`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className={`font-mono text-[11px] font-bold px-1.5 py-0.2 rounded tabular-nums ${
                                  isRedItem
                                    ? 'text-red-700 bg-red-100'
                                    : isBlueNoAddItem
                                    ? 'text-blue-700 bg-blue-100'
                                    : 'text-indigo-700 bg-indigo-100/60'
                                }`}>
                                  #{c.posnr}
                                </span>

                                <div className="flex items-center gap-1">
                                  {isRedItem && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-red-600 text-white">
                                      {getRedMatchedKeyword(c.customerName, c.status)}
                                    </span>
                                  )}
                                  {isBlueNoAddItem && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-600 text-white">
                                      NO add
                                    </span>
                                  )}
                                  {c.action ? (
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                      ACTION_BUTTON_CONFIG.find(a => a.key === c.action)?.colorTheme.badge || 'bg-slate-100'
                                    }`}>
                                      {c.action}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-medium">
                                      Pending
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className={`text-xs font-semibold line-clamp-1 ${
                                isRedItem
                                  ? 'text-red-950 font-bold'
                                  : isBlueNoAddItem
                                  ? 'text-blue-950 font-bold'
                                  : 'text-slate-800'
                              }`}>
                                {c.customerName || <span className="italic text-slate-400 font-normal">[No Customer Name]</span>}
                              </p>

                              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5 tabular-nums">
                                <span>{c.rplEntries.length} RPL {c.rplEntries.length === 1 ? 'Hit' : 'Hits'}</span>
                                {c.status && (
                                  <span className={`font-semibold truncate max-w-[95px] ${
                                    isRedItem
                                      ? 'text-red-700 font-bold'
                                      : isBlueNoAddItem
                                      ? 'text-blue-700 font-bold'
                                      : c.status.toLowerCase().includes('risk')
                                      ? 'text-rose-600'
                                      : 'text-slate-600'
                                  }`}>
                                    {c.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                )}

                {/* MAIN REVIEW WORKSPACE */}
                <div className="flex-1 flex flex-col justify-between p-4 md:p-6 bg-white overflow-y-auto h-full min-h-0 scrollbar-thin">
                  
                  {activeCase ? (
                    <div className="flex-1 flex flex-col gap-4 min-h-0">

                      {/* SIDE-BY-SIDE BOXES: POSNR/CUSTOMER & RPL LIST */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[240px]">
                        
                        {/* 
                          BOX 1 (LEFT / 5 Cols): POSNR & CUSTOMER NAME BOX
                          - SPLF, SPLF(CC), SPLE: Green color + animate green
                          - No add: Blue color
                          - ZKWD: Orange color
                          - EMBF & EMBN: Yellow color
                          - CN: Grey color
                          - BLOC: Red color
                          - If no action assigned:
                            * Red alert if ZKWD/ZEMB/APRV detected
                            * Blue alert ("NO add") if E, F, G / address columns are blank or NO add in status
                        */}
                        {(() => {
                          const boxTheme = getCustomerBoxTheme(
                            activeCase.action,
                            activeCase.customerName,
                            activeCase.status,
                            activeCase.isNoAdd
                          );

                          return (
                            <div className={`lg:col-span-5 rounded-2xl p-5 flex flex-col justify-between transition-all ${boxTheme.containerClass}`}>
                              <div className="space-y-3.5">
                                
                                {/* Header bar with Posnr & Alert/Country badges */}
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-white text-xs font-black shadow-2xs font-mono tabular-nums ${boxTheme.posnrClass}`}>
                                    <span>POSNR:</span>
                                    <span>{activeCase.posnr}</span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {boxTheme.badge && (
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wide ${boxTheme.badge.className}`}>
                                        {boxTheme.badge.isAlert ? (
                                          <AlertCircle size={11} className="text-current" />
                                        ) : (
                                          <Check size={11} className="text-current" strokeWidth={3} />
                                        )}
                                        {boxTheme.badge.text}
                                      </span>
                                    )}

                                    {activeCase.country && (
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold ${boxTheme.countryBadgeClass}`}>
                                        <MapPin size={11} className={boxTheme.countryPinClass} />
                                        <span>{activeCase.country}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Customer Name & Status */}
                                <div className={`transition-all ${boxTheme.nameCardClass}`}>
                                  <label className={`text-[11px] uppercase tracking-wider block mb-1 ${boxTheme.labelClass}`}>
                                    Customer Name
                                  </label>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h2 className={`text-lg sm:text-xl font-bold tracking-tight leading-snug break-words ${boxTheme.nameClass}`}>
                                      {activeCase.customerName || (
                                        <span className="italic text-slate-400 font-normal">[No Customer Name on file]</span>
                                      )}
                                    </h2>
                                    {activeCase.status && (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border shadow-2xs flex-shrink-0 ${boxTheme.statusBadgeClass}`}>
                                        Status: {activeCase.status}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Partner ID & Address details */}
                                <div className={`pt-2 border-t space-y-1.5 text-xs ${boxTheme.subBorderClass}`}>
                                  {activeCase.partnerId && (
                                    <div className="flex items-center justify-between">
                                      <span className={boxTheme.subLabelClass}>Partner ID:</span>
                                      <span className="font-mono font-semibold tabular-nums">{activeCase.partnerId}</span>
                                    </div>
                                  )}
                                  {[activeCase.street, activeCase.city, activeCase.postalCode, activeCase.state].filter(Boolean).length > 0 ? (
                                    <div className="text-xs">
                                      <span className={`${boxTheme.subLabelClass} mr-1.5`}>Address:</span>
                                      <span className="font-medium">
                                        {[activeCase.street, activeCase.city, activeCase.state, activeCase.postalCode].filter(Boolean).join(', ')}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className={boxTheme.subLabelClass}>Address (E, F, G):</span>
                                      <span className="font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">
                                        NO add (Blank)
                                      </span>
                                    </div>
                                  )}
                                </div>

                              </div>

                              {/* Current Decision Callout */}
                              <div className={`mt-4 pt-3 border-t flex items-center justify-between ${boxTheme.actionBorderClass}`}>
                                <div>
                                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${boxTheme.actionLabelClass}`}>
                                    Assigned Action
                                  </span>
                                  {activeCase.action ? (
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border shadow-2xs ${
                                        ACTION_BUTTON_CONFIG.find(a => a.key === activeCase.action)?.colorTheme.badge || 'bg-slate-200'
                                      }`}>
                                        {activeCase.action}
                                      </span>
                                      <button
                                        onClick={handleClearAction}
                                        title="Clear / Undo Action"
                                        className="p-1 rounded transition-colors text-slate-500 hover:text-slate-800 hover:bg-black/5"
                                      >
                                        <RotateCcw size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className={`text-xs font-semibold mt-0.5 inline-block ${
                                      boxTheme.type === 'red-alert'
                                        ? 'text-red-700 font-bold'
                                        : boxTheme.type === 'blue-alert'
                                        ? 'text-blue-700 font-bold'
                                        : 'text-amber-600'
                                    }`}>
                                      Awaiting Action
                                    </span>
                                  )}
                                </div>

                                <span className={`text-[11px] font-mono tabular-nums ${
                                  boxTheme.type === 'default' ? 'text-slate-400 font-normal' : 'font-bold opacity-80'
                                }`}>
                                  Case #{activeCase.caseNumber}
                                </span>
                              </div>

                            </div>
                          );
                        })()}

                        {/* 
                          BOX 2 (RIGHT / 7 Cols): RPL NAME (SCROLLABLE IF MANY, SEARCH BAR, EXACT MATCH HIGHLIGHTED IN RED)
                        */}
                        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col h-full min-h-0">
                          
                          {/* RPL Header with search bar next to RPLname */}
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                RPL Name
                              </h4>
                              <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                ({activeCase.rplEntries.length})
                              </span>
                              {exactMatchCount > 0 && (
                                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                  {exactMatchCount} exact {exactMatchCount === 1 ? 'match' : 'matches'}
                                </span>
                              )}
                            </div>

                            {/* Search bar next to RPLname in tool */}
                            <div className="relative flex-1 max-w-xs min-w-[160px]">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                value={rplSearchQuery}
                                onChange={(e) => setRplSearchQuery(e.target.value)}
                                placeholder="Search in RPL name..."
                                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400 text-slate-800"
                              />
                              {rplSearchQuery && (
                                <button
                                  onClick={() => setRplSearchQuery('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                                  title="Clear search"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* RPL Scrollable List Container */}
                          <div className="mt-3 space-y-2 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                            {displayedRplEntries.length === 0 ? (
                              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                {rplSearchQuery.trim() ? (
                                  <div className="space-y-1">
                                    <p>No RPL Name matching &ldquo;{rplSearchQuery}&rdquo;</p>
                                    <button 
                                      onClick={() => setRplSearchQuery('')}
                                      className="text-indigo-600 hover:underline text-[11px] font-semibold"
                                    >
                                      Reset search
                                    </button>
                                  </div>
                                ) : (
                                  'No RPL Name recorded for this Posnr.'
                                )}
                              </div>
                            ) : (
                              displayedRplEntries.map((rpl, idx) => {
                                const isExact = isExact100Match(activeCase.customerName, rpl.rplName);
                                return (
                                  <div 
                                    key={idx}
                                    className={`p-3 rounded-xl border transition-all text-xs flex flex-wrap items-center justify-between gap-2 ${
                                      isExact 
                                        ? 'border-2 border-red-500 bg-red-50/90 text-red-950 font-bold shadow-2xs ring-1 ring-red-200' 
                                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-slate-900 font-medium'
                                    }`}
                                  >
                                    <span className="flex-1 break-words">
                                      {rpl.rplName || <span className="text-slate-300 italic font-normal">[Blank RPL Name]</span>}
                                    </span>

                                    {isExact && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-2xs flex-shrink-0 animate-pulse">
                                        <AlertCircle size={11} className="text-white" />
                                        Exact match found
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                        </div>

                      </div>

                      {/* CLEAN ACTION DECISION BUTTONS */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Compliance Decision
                          </span>

                          {activeCase.action && (
                            <span className="text-xs text-slate-500 font-medium">
                              Selected: <strong className="text-slate-900">{activeCase.action}</strong>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2">
                          {ACTION_BUTTON_CONFIG.map(btn => {
                            const isSelected = activeCase.action === btn.key;
                            return (
                              <button
                                key={btn.key}
                                onClick={() => handleApplyAction(btn.key)}
                                title={`${btn.label}: ${btn.description}`}
                                className={`group relative flex items-center justify-center py-2 px-2.5 rounded-lg border text-xs font-bold transition-all active:scale-95 shadow-2xs ${
                                  isSelected 
                                    ? btn.colorTheme.active 
                                    : btn.colorTheme.normal
                                }`}
                              >
                                <span className="text-xs font-black tracking-tight truncate">
                                  {btn.label}
                                </span>

                                {/* Hover description tooltip on long hover */}
                                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-md transition-opacity duration-200 delay-300 group-hover:opacity-100">
                                  {btn.description}
                                </span>

                                {isSelected && (
                                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-2xs">
                                    <Check size={8} strokeWidth={3} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* COMMENT BOX */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <MessageSquare size={13} className="text-indigo-600" />
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                              Comment
                            </span>
                          </div>
                          {caseNote && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                              <Check size={11} strokeWidth={3} />
                              Saved
                            </span>
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type="text"
                            value={caseNote}
                            onChange={(e) => handleNoteChange(e.target.value)}
                            placeholder="Add comment or custom status..."
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 hover:bg-white focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                          />
                          {caseNote && (
                            <button
                              onClick={() => handleNoteChange('')}
                              title="Clear comment"
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-400">
                      Select an item from the list on the left to begin review.
                    </div>
                  )}

                  {/* Clean Bottom Bar: Progress & Next */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="font-semibold text-slate-700">
                        {stats.percent}% Processed
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="hidden sm:inline">Shortcuts: [1–9, 0] Decision, [◀/▶] Navigate, [Q] List</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrevCase}
                        disabled={currentCaseIndex === 0}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                      >
                        Prev
                      </button>
                      <button
                        onClick={handleNextCase}
                        disabled={currentCaseIndex >= cases.length - 1}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                      >
                        Next ➜
                      </button>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
