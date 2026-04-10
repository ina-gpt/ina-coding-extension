import React, { useEffect, useState } from 'react';

interface ImageAttachment {
  id: string; data: string; mimeType: string; fileName: string | null;
  width: number; height: number; sizeBytes: number;
}

interface ImageModalProps {
  image: ImageAttachment;
  onClose: () => void;
  onAnnotate?: () => void;
  onAnalyze?: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, onClose, onAnnotate, onAnalyze }) => {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5));
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content" onClick={e => e.stopPropagation()}>
        <button className="image-modal-close" onClick={onClose}>×</button>
        <div className="image-modal-image-wrap" style={{ overflow: 'auto' }}>
          <img
            src={`data:${image.mimeType};base64,${image.data}`}
            alt={image.fileName || 'Image'}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center', maxWidth: zoom === 1 ? '100%' : 'none' }}
          />
        </div>
        <div className="image-modal-toolbar">
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))}>+</button>
          <button onClick={() => setZoom(1)}>Fit</button>
          {onAnnotate && <button onClick={onAnnotate}>Annotate</button>}
          {onAnalyze && <button onClick={onAnalyze}>Analyze</button>}
        </div>
        <div className="image-modal-info">
          {image.fileName && <span>{image.fileName}</span>}
          {image.width > 0 && <span>{image.width}×{image.height}</span>}
          <span>{formatSize(image.sizeBytes)}</span>
        </div>
      </div>
    </div>
  );
};
