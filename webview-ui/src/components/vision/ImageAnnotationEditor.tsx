import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VisionAnnotation {
  type: 'rectangle' | 'circle' | 'arrow' | 'text' | 'highlight';
  coordinates: { x: number; y: number; width?: number; height?: number; x2?: number; y2?: number };
  label: string | null;
  color: string | null;
}

interface ImageAttachment {
  id: string; data: string; mimeType: string; width: number; height: number;
}

interface ImageAnnotationEditorProps {
  image: ImageAttachment;
  existingAnnotations?: VisionAnnotation[];
  onSave: (annotations: VisionAnnotation[]) => void;
  onCancel: () => void;
}

type Tool = 'rectangle' | 'circle' | 'arrow' | 'text' | 'highlight' | 'select';
const COLORS = ['#ff0000', '#0066ff', '#00cc00', '#ffcc00', '#ff6600', '#9933ff'];

export const ImageAnnotationEditor: React.FC<ImageAnnotationEditorProps> = ({ image, existingAnnotations, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('rectangle');
  const [color, setColor] = useState('#ff0000');
  const [annotations, setAnnotations] = useState<VisionAnnotation[]>(existingAnnotations || []);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = `data:${image.mimeType};base64,${image.data}`;
  }, [image.data]);

  useEffect(() => {
    if (imgLoaded) redraw();
  }, [imgLoaded, annotations]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    for (const ann of annotations) {
      ctx.strokeStyle = ann.color || '#ff0000';
      ctx.fillStyle = ann.color || '#ff0000';
      ctx.lineWidth = 3;
      ctx.font = '18px sans-serif';
      const c = ann.coordinates;

      switch (ann.type) {
        case 'rectangle':
          ctx.strokeRect(c.x, c.y, c.width || 100, c.height || 50);
          if (ann.label) { ctx.fillStyle = ann.color || '#ff0000'; ctx.fillText(ann.label, c.x, c.y - 5); }
          break;
        case 'circle':
          ctx.beginPath(); ctx.arc(c.x, c.y, c.width || 30, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'arrow':
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x2 || c.x + 50, c.y2 || c.y); ctx.stroke();
          break;
        case 'text':
          ctx.fillText(ann.label || '', c.x, c.y);
          break;
        case 'highlight':
          ctx.globalAlpha = 0.3; ctx.fillRect(c.x, c.y, c.width || 100, c.height || 50); ctx.globalAlpha = 1;
          break;
      }
    }
  }, [annotations]);

  const getCanvasCoords = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: Math.round((e.clientX - rect.left) * scaleX), y: Math.round((e.clientY - rect.top) * scaleY) };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'select') return;
    const pos = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPoint(pos);

    if (tool === 'text') {
      const label = prompt('Enter text:');
      if (label) {
        setAnnotations(prev => [...prev, { type: 'text', coordinates: { x: pos.x, y: pos.y }, label, color }]);
      }
      setIsDrawing(false);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint || tool === 'text') { setIsDrawing(false); return; }
    const end = getCanvasCoords(e);
    const label = prompt('Label (optional):') || null;

    const ann: VisionAnnotation = tool === 'arrow'
      ? { type: 'arrow', coordinates: { x: startPoint.x, y: startPoint.y, x2: end.x, y2: end.y }, label, color }
      : { type: tool as any, coordinates: { x: Math.min(startPoint.x, end.x), y: Math.min(startPoint.y, end.y), width: Math.abs(end.x - startPoint.x), height: Math.abs(end.y - startPoint.y) }, label, color };

    setAnnotations(prev => [...prev, ann]);
    setIsDrawing(false);
    setStartPoint(null);
  };

  const tools: { id: Tool; label: string; key: string }[] = [
    { id: 'rectangle', label: '▭', key: 'R' }, { id: 'circle', label: '○', key: 'C' },
    { id: 'arrow', label: '→', key: 'A' }, { id: 'text', label: 'T', key: 'T' },
    { id: 'highlight', label: '█', key: 'H' }, { id: 'select', label: '⇱', key: 'V' },
  ];

  return (
    <div className="annotation-editor">
      <div className="annotation-toolbar">
        {tools.map(t => (
          <button key={t.id} className={`ann-tool ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>{t.label}</button>
        ))}
        <div className="ann-colors">
          {COLORS.map(c => (
            <button key={c} className={`ann-color ${color === c ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="annotation-canvas-wrap">
        <canvas ref={canvasRef} className="annotation-canvas" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} style={{ maxWidth: '100%', cursor: tool === 'select' ? 'default' : 'crosshair' }} />
      </div>
      <div className="annotation-list">
        {annotations.map((ann, i) => (
          <div key={i} className="ann-item">
            <span>{ann.type}{ann.label ? `: ${ann.label}` : ''}</span>
            <button onClick={() => setAnnotations(prev => prev.filter((_, idx) => idx !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="annotation-actions">
        <button className="ann-btn ann-btn-primary" onClick={() => onSave(annotations)}>Save & Send</button>
        <button className="ann-btn" onClick={() => setAnnotations([])}>Clear All</button>
        <button className="ann-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};
