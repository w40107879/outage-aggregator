import { OutageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IngestDto {
  @ApiProperty({
    description: 'Controller identifier',
    example: 'AOT1D-25090001',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  controller_id: string;

  @ApiProperty({
    description: 'Type of outage reported by the controller.',
    enum: OutageType,
    example: OutageType.led_outage,
  })
  @IsEnum(OutageType)
  tvent_type: OutageType;

  @ApiProperty({
    description:
      'Telemetry timestamp in Unix seconds or milliseconds. Seconds are automatically converted.',
    example: 1756665796,
  })
  @IsInt()
  @Min(0)
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  timestamp: number;
}

export class IngestResponseDto {
  @ApiProperty({
    description: 'Indicates the request succeeded.',
    example: true,
  })
  ok: boolean;

  @ApiProperty({
    description: 'True when the sample is queued for processing.',
    example: true,
  })
  queued: boolean;
}
