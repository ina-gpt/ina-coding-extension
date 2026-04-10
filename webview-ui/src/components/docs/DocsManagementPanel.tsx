import React, { useState, useEffect, useCallback } from 'react';
import { useChatStore } from '../../store/chatStore';
import { DocSourceCard } from './DocSourceCard';
import { DocSearchResults } from './DocSearchResults';
import { postMessage } from '../../utils/vscode';

type TabType = 'builtin' | 'url' | 'local';

interface BuiltinDoc {
  name: string;
  packageName: string;
  docsUrl: string;
  version: string;
  description: string;
  icon: string;
  category: string;
}

export const DocsManagementPanel: React.FC = () => {
  const { docSources, docSearchResults, docCrawlProgress, isDocsCrawling } = useChatStore();
  const [activeTab, setActiveTab] = useState<TabType>('builtin');
  const [builtins, setBuiltins] = useState<BuiltinDoc[]>([]);
  const [urlName, setUrlName] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [localName, setLocalName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    postMessage({ type: 'getDocSources' as any });
    postMessage({ type: 'getBuiltins' as any });
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'builtinDocs') {
        setBuiltins(msg.builtins || []);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (query.length < 2) return;
    const timer = setTimeout(() => {
      postMessage({ type: 'searchDocs' as any, query });
    }, 500);
    setSearchTimer(timer);
  }, [searchTimer]);

  const handleAddUrl = () => {
    if (!urlName || !urlInput) return;
    postMessage({ type: 'addDocSource' as any, source: { name: urlName, type: 'url', url: urlInput } });
    setUrlName('');
    setUrlInput('');
  };

  const handleAddLocal = () => {
    if (!localName || !localPath) return;
    postMessage({ type: 'addDocSource' as any, source: { name: localName, type: 'local', localPath } });
    setLocalName('');
    setLocalPath('');
  };

  const handleAddBuiltin = (b: BuiltinDoc) => {
    postMessage({ type: 'addDocSource' as any, source: { name: b.name, type: 'builtin', url: b.docsUrl, packageName: b.packageName } });
  };

  const handleRecrawl = (sourceId: string) => {
    postMessage({ type: 'startDocCrawl' as any, sourceId });
  };

  const handleRemove = (sourceId: string) => {
    postMessage({ type: 'removeDocSource' as any, sourceId });
  };

  const addedPackages = new Set(docSources.map(s => s.package_name || s.name.toLowerCase()));
  const categories = [...new Set(builtins.map(b => b.category))];

  return (
    <div className="docs-management">
      {/* Indexed Sources */}
      <div className="docs-section">
        <div className="docs-section-title">INDEXED SOURCES</div>
        {docSources.length === 0 ? (
          <div className="docs-empty">No documentation sources indexed yet. Add one below.</div>
        ) : (
          docSources.map(source => (
            <DocSourceCard
              key={source.id}
              source={source}
              crawlProgress={docCrawlProgress?.sourceId === source.id ? docCrawlProgress : null}
              onRecrawl={() => handleRecrawl(source.id)}
              onRemove={() => handleRemove(source.id)}
            />
          ))
        )}
      </div>

      {/* Add Source */}
      <div className="docs-section">
        <div className="docs-section-title">ADD SOURCE</div>
        <div className="docs-tabs">
          {(['builtin', 'url', 'local'] as TabType[]).map(tab => (
            <div key={tab} className={`docs-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>

        {activeTab === 'builtin' && (
          <div>
            {categories.map(cat => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, opacity: 0.7 }}>{cat}</div>
                <div className="docs-builtin-grid">
                  {builtins.filter(b => b.category === cat).map(b => {
                    const isAdded = addedPackages.has(b.packageName);
                    return (
                      <div
                        key={b.packageName}
                        className={`docs-builtin-item ${isAdded ? 'added' : ''}`}
                        onClick={() => !isAdded && handleAddBuiltin(b)}
                      >
                        <span className="docs-builtin-icon">{b.icon}</span>
                        <span>{b.name}</span>
                        {isAdded && <span className="docs-added-badge">Added</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'url' && (
          <div className="docs-form">
            <input type="text" value={urlName} onChange={e => setUrlName(e.target.value)} placeholder="Documentation name" className="docs-input" />
            <input type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://docs.example.com" className="docs-input" />
            <button className="docs-btn docs-btn-primary" onClick={handleAddUrl} disabled={!urlName || !urlInput}>Add & Index</button>
          </div>
        )}

        {activeTab === 'local' && (
          <div className="docs-form">
            <input type="text" value={localName} onChange={e => setLocalName(e.target.value)} placeholder="Documentation name" className="docs-input" />
            <input type="text" value={localPath} onChange={e => setLocalPath(e.target.value)} placeholder="/path/to/docs" className="docs-input" />
            <button className="docs-btn docs-btn-primary" onClick={handleAddLocal} disabled={!localName || !localPath}>Add & Index</button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="docs-section">
        <div className="docs-section-title">SEARCH</div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search indexed documentation..."
          className="docs-input"
        />
        {docSearchResults.length > 0 && (
          <DocSearchResults results={docSearchResults} query={searchQuery} />
        )}
      </div>
    </div>
  );
};
