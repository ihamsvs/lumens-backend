import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SearchCityDTO } from './dto/cinematic-guide.dto';
import { TripOrchestratorService } from './trip-orchestrator.service';

@Controller('gemini')
export class GeminiController {
  // Inyectamos nuestro nuevo Orquestador
  constructor(private readonly tripOrchestrator: TripOrchestratorService) {}

  @Get('cinematic-guide')
  async getCinematicGuide(@Query() searchDTO: SearchCityDTO) {
    // Verificamos que el DTO y la propiedad 'city' existan
    if (!searchDTO || !searchDTO.city) {
      throw new BadRequestException(
        'El parámetro "city" es obligatorio (ej: /gemini/cinematic-guide?city=un lugar con nieve y castillos)',
      );
    }

    // Pasamos searchDTO.city en lugar de la variable suelta
    return this.tripOrchestrator.planCinematicTrip(searchDTO.city);
  }
}
