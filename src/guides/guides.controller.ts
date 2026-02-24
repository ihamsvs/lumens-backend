import { Controller, Get } from '@nestjs/common';
import { GuideService } from './guides.service';
@Controller('guides')
export class GuideController {
  constructor(private readonly guideService: GuideService) {}

  @Get('explore')
  async getExploreWall() {
    return this.guideService.getLatestGuide();
  }
}
