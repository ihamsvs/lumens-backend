import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { SearchCityDTO } from './dto/cinematic-guide.dto';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get('cinematic-guide')
  async getCinematicGuide(@Query() searchDTO: SearchCityDTO) {
    if (!searchDTO) {
      throw new BadRequestException(
        'El parámetro "city" es obligatorio (ej: /gemini/cinematic-guide?city=Kyoto)',
      );
    }
    return await this.geminiService.generateCinematicGuide(searchDTO.city);
  }
}
