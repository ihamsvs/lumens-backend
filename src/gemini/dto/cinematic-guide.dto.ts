import {
  IsString,
  IsNumber,
  ValidateNested,
  IsArray,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchCityDTO {
  @IsString({ message: 'La búsqueda debe ser un texto válido.' })
  @IsNotEmpty({ message: 'El parámetro "city" no puede estar vacío.' })
  // Aumentamos el límite a 200 o 300 caracteres para permitir descripciones largas,
  // y quitamos cualquier validador @Matches o @IsAlpha que prohibía comas o números.
  @MaxLength(300, {
    message: 'La descripción es demasiado larga (máximo 300 caracteres).',
  })
  city: string;
}

export class CoordinatesDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

export class CameraSettingsDto {
  // Mantenemos esto para el usuario "Pro", pero ya no es lo único importante
  @IsString() iso: string;
  @IsString() shutter_speed: string;
  @IsString() aperture: string;
  @IsString() focal_length: string;
  @IsString() lens_recommendation: string;
}

export class SpotDto {
  @IsString()
  name: string;

  @IsString()
  country: string;

  @IsString()
  city: string;

  @IsString()
  category: string; // Ej: "Cultura", "Naturaleza", "Urbano"
  @IsString()
  @IsOptional()
  image_url?: string;
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;
  // --- INFO TURÍSTICA (PRIORIDAD 1) ---
  @IsString()
  description: string; // Descripción general para el turista común

  @IsString()
  best_time_to_visit: string; // Ej: "Atardecer para evitar multitudes" o "Primavera"

  @IsString()
  visitor_tip: string; // Ej: "Lleva efectivo", "Reserva con antelación"

  // --- INFO CINE & FOTO (PRIORIDAD 2 - El valor diferencial) ---
  @IsString()
  movie_connection: string; // Ej: "Aquí se rodó la escena final de X"

  @ValidateNested()
  @Type(() => CameraSettingsDto)
  camera_settings: CameraSettingsDto;
}

export class TravelGuideResponseDto {
  @IsString()
  destination: string;

  @IsString()
  description_intro: string; // Intro inspiradora sobre la ciudad

  @IsString()
  best_month_to_visit: string; // Ej: "Marzo a Mayo (Cerezos)"
  @IsString()
  @IsOptional()
  destination_image_url?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpotDto)
  spots: SpotDto[];
}
