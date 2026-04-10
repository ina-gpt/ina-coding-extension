import { VisionAnnotation } from './VisionTypes';

export class ImageAnnotationService {
  private static instance: ImageAnnotationService;
  private activeAnnotations: Map<string, VisionAnnotation[]> = new Map();

  static getInstance(): ImageAnnotationService {
    if (!ImageAnnotationService.instance) {
      ImageAnnotationService.instance = new ImageAnnotationService();
    }
    return ImageAnnotationService.instance;
  }

  addAnnotation(imageId: string, annotation: VisionAnnotation): void {
    const list = this.activeAnnotations.get(imageId) || [];
    list.push(annotation);
    this.activeAnnotations.set(imageId, list);
  }

  removeAnnotation(imageId: string, annotationIndex: number): void {
    const list = this.activeAnnotations.get(imageId) || [];
    list.splice(annotationIndex, 1);
    this.activeAnnotations.set(imageId, list);
  }

  clearAnnotations(imageId: string): void {
    this.activeAnnotations.delete(imageId);
  }

  getAnnotations(imageId: string): VisionAnnotation[] {
    return this.activeAnnotations.get(imageId) || [];
  }

  createRectangleAnnotation(x: number, y: number, width: number, height: number, label?: string, color?: string): VisionAnnotation {
    return { type: 'rectangle', coordinates: { x, y, width, height }, label: label || null, color: color || '#ff0000' };
  }

  createCircleAnnotation(cx: number, cy: number, radius: number, label?: string, color?: string): VisionAnnotation {
    return { type: 'circle', coordinates: { x: cx, y: cy, width: radius }, label: label || null, color: color || '#ff0000' };
  }

  createArrowAnnotation(x1: number, y1: number, x2: number, y2: number, label?: string, color?: string): VisionAnnotation {
    return { type: 'arrow', coordinates: { x: x1, y: y1, x2, y2 }, label: label || null, color: color || '#ff0000' };
  }

  createTextAnnotation(x: number, y: number, text: string, color?: string): VisionAnnotation {
    return { type: 'text', coordinates: { x, y }, label: text, color: color || '#ffffff' };
  }

  createHighlightAnnotation(x: number, y: number, width: number, height: number, color?: string): VisionAnnotation {
    return { type: 'highlight', coordinates: { x, y, width, height }, label: null, color: color || '#ffff00' };
  }

  buildAnnotationPrompt(annotations: VisionAnnotation[]): string {
    if (annotations.length === 0) return '';
    const parts = annotations.map(a => {
      const pos = `(${a.coordinates.x}, ${a.coordinates.y})`;
      switch (a.type) {
        case 'rectangle': return `${a.color || 'Red'} rectangle at ${pos}${a.label ? ` labeled "${a.label}"` : ''}`;
        case 'circle': return `Circle at ${pos}${a.label ? ` labeled "${a.label}"` : ''}`;
        case 'arrow': return `Arrow from ${pos} to (${a.coordinates.x2}, ${a.coordinates.y2})${a.label ? `: "${a.label}"` : ''}`;
        case 'text': return `Text at ${pos}: "${a.label}"`;
        case 'highlight': return `Highlighted area at ${pos}${a.label ? ` — "${a.label}"` : ''}`;
        default: return '';
      }
    }).filter(Boolean);
    return `Annotations on this image:\n${parts.map(p => `- ${p}`).join('\n')}\nPay special attention to annotated areas.`;
  }
}
