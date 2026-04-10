import React, { useState } from 'react';

interface ImageAttachment {
  id: string; data: string; mimeType: string; fileName: string | null;
  width: number; height: number; sizeBytes: number; thumbnail: string | null;
  annotations: any[];
}

interface ImagePreviewProps {
  images: ImageAttachment[];
  onAnnotate?: (image: ImageAttachment) => void;
  onAnalyze?: (image: ImageAttachment) => void;
  onDesignToCode?: (image: ImageAttachment) => void;
  isUserMessage?: boolean;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ images, onAnnotate, onAnalyze, onDesignToCode, isUserMessage }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!images || images.length === 0) return null;

  const gridCols = images.length === 1 ? 1 : images.length <= 3 ? 2 : 3;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="image-preview-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
      {images.map(img => {
        const src = `data:${img.mimeType};base64,${img.thumbnail || img.data}`;
        const isHovered = hoveredId === img.id;
        const isExpanded = expandedId === img.id;

        return (
          <div key={img.id} className="image-preview-item" onMouseEnter={() => setHoveredId(img.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => setExpandedId(isExpanded ? null : img.id)}>
            <img src={isExpanded ? `data:${img.mimeType};base64,${img.data}` : src} alt={img.fileName || 'Image'} className={`image-preview-img ${isExpanded ? 'expanded' : ''}`} />
            {img.width > 0 && <span className="image-badge image-dimensions">{img.width}×{img.height}</span>}
            <span className="image-badge image-size">{formatSize(img.sizeBytes)}</span>
            {isHovered && !isExpanded && (
              <div className="image-preview-actions">
                {onAnalyze && <button className="image-action-btn" onClick={(e) => { e.stopPropagation(); onAnalyze(img); }} title="Analyze">🔍</button>}
                {onDesignToCode && <button className="image-action-btn" onClick={(e) => { e.stopPropagation(); onDesignToCode(img); }} title="Design to Code">💻</button>}
                {onAnnotate && <button className="image-action-btn" onClick={(e) => { e.stopPropagation(); onAnnotate(img); }} title="Annotate">✏️</button>}
              </div>
            )}
            {img.annotations && img.annotations.length > 0 && <span className="image-badge image-annotated">✏ {img.annotations.length}</span>}
          </div>
        );
      })}
    </div>
  );
};
