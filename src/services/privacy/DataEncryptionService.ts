/**
 * Phase 12.1 — Data Encryption Service
 * Encrypts/decrypts data at rest using AES-256-GCM.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../../utils/Logger';
import { EditorCompat } from '../compat/EditorCompat';

const ENC_PREFIX = 'enc:v1:';
const KEY_NAME = 'ina-encryption-key';
const SALT_NAME = 'ina-encryption-salt';

export class DataEncryptionService {
  private static instance: DataEncryptionService;
  private key: Buffer | null = null;
  private isInitialized = false;
  private context: vscode.ExtensionContext | null = null;

  static getInstance(): DataEncryptionService {
    if (!DataEncryptionService.instance) {
      DataEncryptionService.instance = new DataEncryptionService();
    }
    return DataEncryptionService.instance;
  }

  private constructor() {}

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    const compat = EditorCompat.getInstance();
    try {
      let keyHex = await compat.getSecret(context, KEY_NAME);
      if (!keyHex) {
        // Generate new key — use EditorCompat.getMachineId() for cross-editor compatibility
        const salt = crypto.randomBytes(32);
        const machineId = compat.getMachineId();
        this.key = crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha512');
        await compat.setSecret(context, KEY_NAME, this.key.toString('hex'));
        await compat.setSecret(context, SALT_NAME, salt.toString('hex'));
        Logger.info('[Encryption] New encryption key generated');
      } else {
        this.key = Buffer.from(keyHex, 'hex');
      }
      this.isInitialized = true;
      Logger.info(`[Encryption] Initialized (key fingerprint: ${this.getKeyFingerprint()})`);
    } catch (e) {
      Logger.warn('[Encryption] Init failed, encryption disabled:', e);
      this.isInitialized = false;
    }
  }

  encrypt(data: string): string {
    if (!this.isInitialized || !this.key) return data;
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
      const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const payload = Buffer.concat([iv, authTag, encrypted]);
      return ENC_PREFIX + payload.toString('base64');
    } catch (e) {
      Logger.debug('[Encryption] Encrypt failed:', e);
      return data;
    }
  }

  decrypt(encryptedData: string): string {
    if (!encryptedData.startsWith(ENC_PREFIX)) return encryptedData;
    if (!this.isInitialized || !this.key) return encryptedData;
    try {
      const payload = Buffer.from(encryptedData.substring(ENC_PREFIX.length), 'base64');
      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const ciphertext = payload.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(ciphertext) + decipher.final('utf8');
    } catch (e) {
      Logger.debug('[Encryption] Decrypt failed');
      return encryptedData;
    }
  }

  encryptObject<T>(obj: T): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptObject<T>(encrypted: string): T {
    return JSON.parse(this.decrypt(encrypted));
  }

  isEncrypted(data: string): boolean {
    return data.startsWith(ENC_PREFIX);
  }

  async rotateKey(): Promise<void> {
    if (!this.context) return;
    const compat = EditorCompat.getInstance();
    Logger.info('[Encryption] Key rotation initiated');
    const salt = crypto.randomBytes(32);
    this.key = crypto.pbkdf2Sync(compat.getMachineId(), salt, 100000, 32, 'sha512');
    await compat.setSecret(this.context, KEY_NAME, this.key.toString('hex'));
    await compat.setSecret(this.context, SALT_NAME, salt.toString('hex'));
    Logger.info(`[Encryption] Key rotated (new fingerprint: ${this.getKeyFingerprint()})`);
  }

  async wipeKey(): Promise<void> {
    if (!this.context) return;
    const compat = EditorCompat.getInstance();
    await compat.deleteSecret(this.context, KEY_NAME);
    await compat.deleteSecret(this.context, SALT_NAME);
    if (this.key) { this.key.fill(0); this.key = null; }
    this.isInitialized = false;
    Logger.info('[Encryption] Key wiped — encrypted data is now unrecoverable');
  }

  getKeyFingerprint(): string {
    if (!this.key) return 'none';
    return crypto.createHash('sha256').update(this.key).digest('hex').substring(0, 8);
  }

  isReady(): boolean { return this.isInitialized; }

  dispose(): void {
    if (this.key) { this.key.fill(0); this.key = null; }
    this.isInitialized = false;
  }
}
