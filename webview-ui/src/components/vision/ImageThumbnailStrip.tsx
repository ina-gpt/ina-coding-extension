import React from 'react';

interface ImageAttachment {
  id: string; data: string; mimeType: string; fileName: string | null;
  sizeBytes: number; thumbnail: string | null; annotations: any[];
}

interface ImageThumbnailStripProps {
  images: ImageAttachment[];
  onRemove: (imageId: string) => void;
  onClick: (image: ImageAttachment) => void;
  maxDisplay?: number;
}

export const ImageThumbnailStrip: React.FC<ImageThumbnailStripProps> = ({ images, onRemove, onClick, maxDisplay = 5 }) => {
  if (images.length === 0) return null;

  const displayed = images.slice(0, maxDisplay);
  const overflow = images.length - maxDisplay;

  return (
    <div className="thumbnail-strip">
      {displayed.map(img => {
        const src = `data:${img.mimeType};base64,${img.thumbnail || img.data}`;
        return (
          <div key={img.id} className="thumbnail-item" onClick={() => onClick(img)}>
            <img src={src} alt={img.fileName || 'Image'} className="thumbnail-img" />
            <button className="thumbnail-remove" onClick={(e) => { e.stopPropagation(); onRemove(img.id); }} title="Remove">×</button>
            {img.annotations.length > 0 && <span className="thumbnail-annotation-badge">✏</span>}
          </div>
        );
      })}
      {overflow > 0 && <div className="thumbnail-overflow">+{overflow}</div>}
    </div>
  );
};
