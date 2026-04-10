import React, { useCallback, useRef, useState } from 'react';

interface ImageAttachment {
  id: string; data: string; mimeType: string; fileName: string | null;
  width: number; height: number; sizeBytes: number; thumbnail: string | null;
  annotations: any[]; source: string;
}

interface ImageUploadAreaProps {
  onImagesAdded: (images: ImageAttachment[]) => void;
  maxImages: number;
  currentCount: number;
  disabled?: boolean;
}

export const ImageUploadArea: React.FC<ImageUploadAreaProps> = ({ onImagesAdded, maxImages, currentCount, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    processFiles(files);
  }, [disabled, currentCount, maxImages]);

  const handleFileSelect = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [currentCount, maxImages]);

  const processFiles = async (files: File[]) => {
    const remaining = maxImages - currentCount;
    const toProcess = files.slice(0, remaining);
    const images: ImageAttachment[] = [];

    for (const file of toProcess) {
      if (file.size > 10 * 1024 * 1024) continue;
      try {
        const data = await readFileAsBase64(file);
        images.push({
          id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          data, mimeType: file.type,
          fileName: file.name, width: 0, height: 0,
          sizeBytes: file.size, thumbnail: null,
          annotations: [], source: 'drag',
        });
      } catch { /* skip */ }
    }

    if (images.length > 0) onImagesAdded(images);
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.replace(/^data:image\/[^;]+;base64,/, ''));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <>
      <div
        className={`image-upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="image-drop-overlay">
            <div className="image-drop-content">
              <span className="image-drop-icon">🖼️</span>
              <span>Drop images here</span>
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        className="image-upload-btn"
        onClick={handleFileSelect}
        disabled={disabled || currentCount >= maxImages}
        title="Attach image"
      >
        📎
      </button>
    </>
  );
};
