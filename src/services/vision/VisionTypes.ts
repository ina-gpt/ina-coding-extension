export interface VisionImage {
  id: string;
  data: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileName: string | null;
  sizeBytes: number;
  annotations: VisionAnnotation[] | null;
}

export interface VisionAnnotation {
  type: 'rectangle' | 'circle' | 'arrow' | 'text' | 'highlight';
  coordinates: { x: number; y: number; width?: number; height?: number; x2?: number; y2?: number };
  label: string | null;
  color: string | null;
}

export interface VisionAnalysis {
  description: string;
  elements: UIElement[];
  colors: string[];
  layout: string;
  textContent: string[];
  codeSnippets: string[];
  suggestions: string[];
}

export interface UIElement {
  type: string;
  label: string | null;
  position: { x: number; y: number; width: number; height: number } | null;
  style: { backgroundColor: string | null; textColor: string | null; fontSize: string | null; borderRadius: string | null } | null;
  children: string[] | null;
}

export interface DesignToCodeRequest {
  image: VisionImage;
  framework: string;
  cssFramework: string;
  responsive: boolean;
  includeInteractivity: boolean;
  targetLanguage: string;
  additionalInstructions: string | null;
}

export interface DesignToCodeResponse {
  code: string;
  framework: string;
  cssFramework: string;
  components: { name: string; code: string; filePath: string }[];
  dependencies: string[];
  preview: string | null;
}

export interface ImageAttachment {
  id: string;
  data: string;
  mimeType: string;
  fileName: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  thumbnail: string | null;
  annotations: VisionAnnotation[];
  source: ImageSource;
}

export enum ImageSource {
  CLIPBOARD = 'clipboard',
  FILE_UPLOAD = 'file',
  DRAG_DROP = 'drag',
  SCREENSHOT = 'screenshot',
  EDITOR = 'editor',
}

export interface DesignToCodeConfig {
  framework: string;
  cssFramework: string;
  responsive: boolean;
  includeInteractivity: boolean;
  targetLanguage: string;
}

export type VisionEvent = 'image-added' | 'image-removed' | 'image-annotated' | 'analysis-started' | 'analysis-complete' | 'design-to-code-started' | 'design-to-code-complete';

export const IMAGE_CONSTANTS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_IMAGES_PER_MESSAGE: 5,
  THUMBNAIL_MAX_DIM: 200,
  SUPPORTED_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'],
  CLIPBOARD_CHECK_INTERVAL_MS: 500,
} as const;
