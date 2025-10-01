import { OutageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class IngestDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  controller_id: string;

  @IsEnum(OutageType)
  tvent_type: OutageType;

  @IsNumber()
  timestamp: number;
}
