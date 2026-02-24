import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
@Injectable()
export class GuideService {
  private supabase: SupabaseClient<any, any, any>;
  private readonly logger = new Logger(GuideService.name);
  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') ?? '';
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY') ?? '';
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }
  /**
   * Obtiene las últimas guías generadas directamente de la base de datos
   */
  async getLatestGuide() {
    this.logger.log(
      'Obteniendo últimas guías de Supabase para el muro de explorar',
    );
    try {
      const { data, error } = await this.supabase
        .from('guides')
        .select('search_term, data')
        .limit(12);
      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error obteniendo guías de Supabase', error);
      throw new InternalServerErrorException(
        'No se puedo cargar el muro de explorar',
      );
    }
  }
}
