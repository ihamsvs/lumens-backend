/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { GeminiController } from './gemini.controller';
import { GeminiService } from './gemini.service';
import { VibeRouterService } from './vibe-router.service';
import { TripOrchestratorService } from './trip-orchestrator.service';

@Module({
  controllers: [GeminiController],
  providers: [GeminiService, VibeRouterService, TripOrchestratorService],
})
export class GeminiModule {}
