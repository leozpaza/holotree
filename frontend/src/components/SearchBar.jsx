import React, { useState, useEffect, useRef } from 'react';

function SearchBar({ onSearch, results, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    // Debounced search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      onSearch(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onSearch]);

  useEffect(() => {
    setIsOpen(results.length > 0 || (query.length > 0 && results.length === 0));
  }, [results, query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (nodeId) => {
    onSelect(nodeId);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="search-container" ref={containerRef}>
      <div className="search-input-wrapper">
        <span className="search-icon">⌕</span>
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по базе знаний..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query && setIsOpen(true)}
        />
      </div>

      {isOpen && (
        <div className="search-results">
          {results.length > 0 ? (
            results.map((node) => (
              <div
                key={node.id}
                className="search-result-item"
                onClick={() => handleSelect(node.id)}
              >
                <div className="search-result-title">{node.title}</div>
                <div className="search-result-path">ID: {node.id.substring(0, 8)}...</div>
              </div>
            ))
          ) : query.length > 0 ? (
            <div className="search-no-results">Ничего не найдено</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
