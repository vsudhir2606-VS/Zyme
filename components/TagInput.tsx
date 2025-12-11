import React, { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

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
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const trimmed = inputValue.trim();
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
          flex flex-wrap gap-2 p-2 border rounded-lg min-h-[46px] transition-all duration-200
          ${isFocused 
            ? 'bg-slate-800 border-indigo-500 ring-1 ring-indigo-500/50' 
            : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
          }
        `}
      >
        {tags.map((tag) => (
          <span key={tag} className="animate-in fade-in zoom-in duration-200 inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1.5 inline-flex items-center justify-center text-indigo-400 hover:text-white transition-colors focus:outline-none"
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          onFocus={() => setIsFocused(true)}
          onBlurCapture={() => setIsFocused(false)}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500"
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
      <p className="text-[10px] text-slate-500">Press Enter to add.</p>
    </div>
  );
};