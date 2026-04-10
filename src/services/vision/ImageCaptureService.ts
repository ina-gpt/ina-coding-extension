import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ImageAttachment, ImageSource, IMAGE_CONSTANTS } from './VisionTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class ImageCaptureService {
  private static instance: ImageCaptureService;

  static getInstance(): ImageCaptureService {
    if (!ImageCaptureService.instance) {
      ImageCaptureService.instance = new ImageCaptureService();
    }
    return ImageCaptureService.instance;
  }

  async captureFromClipboard(): Promise<ImageAttachment | null> {
    try {
      const platform = process.platform;
      let buffer: Buffer | null = null;
      let mimeType = 'image/png';

      if (platform === 'darwin') {
        try {
          const result = execSync('osascript -e "the clipboard as «class PNGf»"', { maxBuffer: 20 * 1024 * 1024 });
          const hex = result.toString().replace(/«data PNGf/g, '').replace(/»/g, '').replace(/\s/g, '');
          buffer = Buffer.from(hex, 'hex');
        } catch {
          try {
            const tmpPath = '/tmp/ina-clipboard.png';
            execSync(`pngpaste ${tmpPath}`, { timeout: 5000 });
            if (fs.existsSync(tmpPath)) {
              buffer = fs.readFileSync(tmpPath);
              fs.unlinkSync(tmpPath);
            }
          } catch { /* no image in clipboard */ }
        }
      } else if (platform === 'win32') {
        try {
          const tmpPath = path.join(process.env.TEMP || '/tmp', 'ina-clipboard.png');
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetImage().Save('${tmpPath}')"`, { timeout: 5000 });
          if (fs.existsSync(tmpPath)) {
            buffer = fs.readFileSync(tmpPath);
            fs.unlinkSync(tmpPath);
          }
        } catch { /* no image */ }
      } else {
        try {
          buffer = execSync('xclip -selection clipboard -t image/png -o', { maxBuffer: 20 * 1024 * 1024, timeout: 5000 });
        } catch { /* no image */ }
      }

      if (!buffer || buffer.length < 100) return null;

      const data = buffer.toString('base64');
      return {
        id: this.generateId(),
        data,
        mimeType,
        fileName: 'clipboard-image.png',
        width: 0,
        height: 0,
        sizeBytes: buffer.length,
        thumbnail: null,
        annotations: [],
        source: ImageSource.CLIPBOARD,
      };
    } catch (error) {
      Logger.warn('Clipboard capture failed:', error);
      return null;
    }
  }

  async captureFromFile(filePaths?: string[]): Promise<ImageAttachment[]> {
    let paths = filePaths;

    if (!paths || paths.length === 0) {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: true,
        filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        title: 'Select images to attach',
      });
      if (!result) return [];
      paths = result.map(uri => uri.fsPath);
    }

    const attachments: ImageAttachment[] = [];
    for (const filePath of paths.slice(0, IMAGE_CONSTANTS.MAX_IMAGES_PER_MESSAGE)) {
      try {
        const { data, mimeType, sizeBytes } = this.readFileAsBase64(filePath);
        if (sizeBytes > IMAGE_CONSTANTS.MAX_FILE_SIZE_MB * 1024 * 1024) {
          vscode.window.showWarningMessage(`Image ${path.basename(filePath)} exceeds ${IMAGE_CONSTANTS.MAX_FILE_SIZE_MB}MB limit`);
          continue;
        }
        attachments.push({
          id: this.generateId(),
          data, mimeType,
          fileName: path.basename(filePath),
          width: 0, height: 0, sizeBytes,
          thumbnail: null,
          annotations: [],
          source: ImageSource.FILE_UPLOAD,
        });
      } catch (error) {
        Logger.warn(`Failed to read image ${filePath}:`, error);
      }
    }

    return attachments;
  }

  async captureFromDragDrop(imageData: { base64: string; mimeType: string; fileName: string }): Promise<ImageAttachment> {
    const data = imageData.base64.replace(/^data:image\/[^;]+;base64,/, '');
    const sizeBytes = Buffer.from(data, 'base64').length;

    return {
      id: this.generateId(),
      data,
      mimeType: imageData.mimeType,
      fileName: imageData.fileName,
      width: 0, height: 0, sizeBytes,
      thumbnail: null,
      annotations: [],
      source: ImageSource.DRAG_DROP,
    };
  }

  async captureScreenshot(): Promise<ImageAttachment | null> {
    const platform = process.platform;

    try {
      if (platform === 'darwin') {
        const tmpPath = '/tmp/ina-screenshot.png';
        execSync(`screencapture -i ${tmpPath}`, { timeout: 30000 });
        if (fs.existsSync(tmpPath)) {
          const buffer = fs.readFileSync(tmpPath);
          fs.unlinkSync(tmpPath);
          return {
            id: this.generateId(),
            data: buffer.toString('base64'),
            mimeType: 'image/png',
            fileName: 'screenshot.png',
            width: 0, height: 0, sizeBytes: buffer.length,
            thumbnail: null, annotations: [],
            source: ImageSource.SCREENSHOT,
          };
        }
      } else if (platform === 'linux') {
        const tmpPath = '/tmp/ina-screenshot.png';
        try { execSync(`gnome-screenshot -a -f ${tmpPath}`, { timeout: 30000 }); } catch { try { execSync(`xfce4-screenshooter -r -s ${tmpPath}`, { timeout: 30000 }); } catch { /* no tool */ } }
        if (fs.existsSync(tmpPath)) {
          const buffer = fs.readFileSync(tmpPath);
          fs.unlinkSync(tmpPath);
          return {
            id: this.generateId(), data: buffer.toString('base64'),
            mimeType: 'image/png', fileName: 'screenshot.png',
            width: 0, height: 0, sizeBytes: buffer.length,
            thumbnail: null, annotations: [], source: ImageSource.SCREENSHOT,
          };
        }
      }
    } catch (e) {
      Logger.warn('Screenshot capture failed:', e);
    }

    vscode.window.showInformationMessage('Use your system screenshot tool, then paste with Cmd/Ctrl+V');
    return null;
  }

  async captureFromEditor(): Promise<ImageAttachment | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const filePath = editor.document.uri.fsPath;
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

    if (!imageExts.includes(ext)) return null;

    const { data, mimeType, sizeBytes } = this.readFileAsBase64(filePath);
    return {
      id: this.generateId(), data, mimeType,
      fileName: path.basename(filePath),
      width: 0, height: 0, sizeBytes,
      thumbnail: null, annotations: [],
      source: ImageSource.EDITOR,
    };
  }

  private readFileAsBase64(filePath: string): { data: string; mimeType: string; sizeBytes: number } {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml', '.tiff': 'image/tiff',
    };
    return { data: buffer.toString('base64'), mimeType: mimeMap[ext] || 'image/png', sizeBytes: buffer.length };
  }

  private generateId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
