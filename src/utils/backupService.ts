// 备份工具 - 使用IndexedDB存储加密文件操作记录

interface BackupRecord {
  id: string
  type: 'encrypt' | 'decrypt'
  fileType: 'pdf' | 'file'
  fileName: string
  fileSize: number
  encryptionMode?: 'standard' | 'strong'
  timestamp: number
  metadata?: {
    passwordHash?: string // 仅存储哈希，不存储明文密码
    operation?: string
  }
}

class BackupService {
  private dbName = 'CommonToolsBackup'
  private dbVersion = 1
  private storeName = 'encryptionRecords'
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: false })
          objectStore.createIndex('timestamp', 'timestamp', { unique: false })
          objectStore.createIndex('type', 'type', { unique: false })
          objectStore.createIndex('fileType', 'fileType', { unique: false })
        }
      }
    })
  }

  async addRecord(record: Omit<BackupRecord, 'id' | 'timestamp'>): Promise<void> {
    if (!this.db) await this.init()

    const fullRecord: BackupRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.add(fullRecord)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getAllRecords(): Promise<BackupRecord[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  }

  async deleteRecord(id: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(id)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async exportBackup(): Promise<string> {
    const records = await this.getAllRecords()
    return JSON.stringify(records, null, 2)
  }

  async importBackup(jsonData: string): Promise<void> {
    const records: BackupRecord[] = JSON.parse(jsonData)
    await this.clearAll()
    
    for (const record of records) {
      await this.addRecord(record)
    }
  }
}

export const backupService = new BackupService()

// 生成密码哈希（不存储明文）
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

