import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class JsonStoreService implements OnModuleInit {
  private readonly dataDir = join(process.cwd(), 'data');

  async onModuleInit(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  private filePath(name: string): string {
    return join(this.dataDir, name);
  }

  async read<T>(filename: string, defaultValue: T): Promise<T> {
    try {
      const raw = await readFile(this.filePath(filename), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  async write<T>(filename: string, data: T): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      this.filePath(filename),
      JSON.stringify(data, null, 2),
      'utf8',
    );
  }
}
