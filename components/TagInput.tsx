import React, { useState, KeyboardEvent, ClipboardEvent } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange, placeholder, label }) => {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    // Split by comma or new lines
    const newTags = paste.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);
    
    if (newTags.length > 0) {
      // Filter out duplicates
      const uniqueNewTags = newTags.filter(t => !tags.includes(t));
      if (uniqueNewTags.length > 0) {
        onChange([...tags, ...uniqueNewTags]);
      }
    }
  };

  const addTag = () => {
    const trimmed = inputValue.trim().replace(/,/g, '');
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="w-full space-y-2">
      {label && <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>}
      <div 
        className={`
          relative flex flex-wrap gap-2 p-2.5 border rounded-xl min-h-[50px] transition-all duration-200 bg-slate-900/40
          ${isFocused 
            ? 'border-indigo-500/50 ring-2 ring-indigo-500/20' 
            : 'border-slate-700/50 hover:border-slate-600'
          }
        `}
      >
        {tags.map((tag) => (
          <span key={tag} className="animate-in fade-in zoom-in duration-200 inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1.5 p-0.5 rounded-full hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-200 transition-colors focus:outline-none"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={addTag}
          onFocus={() => setIsFocused(true)}
          onBlurCapture={() => setIsFocused(false)}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600 font-medium"
          placeholder={tags.length === 0 ? placeholder : ''}
        />
        
        {/* Visual hint for enter key if typing */}
        {inputValue && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex pointer-events-none animate-in fade-in">
             <div className="bg-slate-700/50 text-slate-400 text-[10px] px-1.5 py-0.5 rounded border border-slate-600">Enter</div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-500 flex items-center gap-1">
        <Plus size={10} /> Type or paste comma-separated values
      </p>
    </div>
  );
};