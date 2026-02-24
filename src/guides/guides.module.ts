import { Module } from '@nestjs/common';
import { GuideController } from './guides.controller';
import { GuideService } from './guides.service';
@Module({
  controllers: [GuideController],
  providers: [GuideService],
})
export class GuidesModule {}
