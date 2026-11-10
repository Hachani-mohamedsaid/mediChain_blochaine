import { Global, Module } from '@nestjs/common';
import { JsonStoreService } from './json-store.service.js';

@Global()
@Module({
  providers: [JsonStoreService],
  exports: [JsonStoreService],
})
export class PersistenceModule {}
